import {
    BadRequestException,
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { holdState } from "../bookings/booking-hold";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { printedSeller } from "../invoices/invoice-paper-view";
import type { InvoiceStanding } from "../invoices/invoice-state";
import { invoiceStanding } from "../invoices/invoice-state";
import { isBillOfSupply } from "../invoices/invoice-title";
import { payLinkUrlFor } from "../invoices/pay-link-url";
import { invoicePayOnline, NOT_PAID_ONLINE } from "../invoices/pay-online";
import { hashPayToken } from "../invoices/pay-token";
import type {
    BusinessContactView,
    PayInstructionsView,
} from "../organizations/business-pay-instructions";
import {
    businessContactOf,
    businessPayInstructionsOf,
} from "../organizations/business-pay-instructions";
import {
    assertOrganizationOpen,
    assertOrganizationWindingDown,
} from "../organizations/organization-lifecycle.gate";
import { siteOriginOf } from "../sites/site-origin";
import { parseSiteStyle, siteStyleVariables } from "../sites/site-style";
import { nextAutopayCharge } from "../subscriptions/next-autopay-charge";
import type {
    AutopayCheck,
    AutopayOutcome,
    AutopayStart,
} from "./autopay.service";
import { AutopayService } from "./autopay.service";
import type { ChargeUnderWay } from "./charge-under-way";
import { autopayChargeInProgress, chargeUnderWayOn } from "./charge-under-way";
import { MandateChargesService } from "./mandate-charges.service";
import type { CreateIntentResult } from "./payments.service";
import { PaymentsService } from "./payments.service";
import type { MandateMethod } from "./providers/provider.port";
import {
    isMandateMethod,
    isSupportedProvider,
} from "./providers/provider.port";

/**
 * What the customer's pay page shows, and nothing more (ADR-007, U13). An
 * explicit allow-list: no email, contact or invoice id, no notes, no payment
 * references, no internal state.
 */
export interface PublicInvoiceView {
    /** The business as named when the invoice was issued (DEC-082). */
    businessName: string;
    number: string;
    issuedAt: string | null;
    dueAt: string | null;
    lines: {
        description: string;
        quantity: number;
        unitPrice: string;
        amount: string;
    }[];
    tax: string;
    total: string;
    currency: string;
    /** Overdue is derived, as in the workspace. Void means not payable. */
    status: Exclude<InvoiceStanding, "DRAFT">;
    billedTo: string | null;
    /**
     * A registered business's paper whose every line is exempt (D15): the
     * page calls it a bill of supply, as the merchant's copy does. The
     * rates and the GSTIN it is worked out from stay behind.
     */
    billOfSupply: boolean;
    /** The business's site theme as `--site-*` variables; null for defaults. */
    theme: Record<string, string> | null;
    /**
     * The business takes payment online (DEC-070): Payments is on and a
     * provider can open the checkout window. False: the page shows the
     * invoice and its PDF with no Pay button, and a payment start is a 409.
     * Set on the pay link's read only; absent (an older API, or the account
     * area's receipt), the page behaves as before.
     */
    payOnline?: boolean;
    /**
     * Autopay for the plan this invoice is for (D12): the pay page's
     * allow-list gains only this. Absent or null: not a plan's invoice, the
     * plan has ended, or the business's provider takes no autopay.
     */
    autopay?: PayAutopay | null;
    /**
     * An autopay charge is under way on this invoice (D13): the page says
     * "Autopay charge in progress · ‹date›" (`at`: when the debit is asked
     * for) and offers no payment, which the API would refuse (409).
     */
    autopayCharging?: { at: string } | null;
    /**
     * "Next autopay charge: ‹date›" (D13B, DEC-065): the planned debit of a
     * charge queued on this invoice and not yet asked for, or — the invoice
     * paid, autopay on — the next renewal's, by the business's timing.
     */
    autopayNextCharge?: { at: string } | null;
    /**
     * Where this link lives (DEC-069, plan L6): `payLinkUrlFor`'s answer,
     * the business's own address or the apex. The renderer sends a pay
     * page opened on another host here. Only the pay read carries it; a
     * receipt in the account area does not.
     */
    payUrl?: string;
    /**
     * "How to pay us" (R32): the business's UPI ID, bank details and note,
     * on the pay link's read of an invoice that is owed and can't be paid
     * online — the customer's own invoice, so the details go to someone the
     * business billed. Null when the business set none; absent otherwise.
     */
    payInstructions?: PayInstructionsView | null;
    /**
     * The business's phone and email (UX-007), on the same read when it set
     * no How to pay us: the page says "Contact them to pay" with a way to
     * reach them. Null when neither is set; absent otherwise.
     */
    businessContact?: BusinessContactView | null;
}

/** What the pay page may say about autopay (D12). */
export interface PayAutopay {
    /** The plan's name. */
    plan: string;
    /** Every method the business's provider offers, never narrowed. */
    methods: MandateMethod[];
    /** Autopay is on already: the method and its displayable hint. */
    on: { method: MandateMethod | null; hint: string | null } | null;
    /**
     * The check each method takes to authorise when nothing is owed — the
     * invoice already paid (DEC-064: UPI and card ₹1, refunded). Absent
     * from an API older than D12B.
     */
    checks: Partial<Record<MandateMethod, AutopayCheck>>;
}

/**
 * An issued invoice as the pay link's paper shows it: the allow-list above.
 * The pay page reads it by token; the customer's account area (A5) reads a
 * paid one of their own as a receipt. The caller has already found the
 * invoice in `organizationId` and runs this in that business's RLS context.
 * A draft (no number) is a 404.
 */
export async function invoicePaper(
    organizationId: string,
    invoiceId: string,
): Promise<PublicInvoiceView> {
    const invoice = await prisma.invoice.findFirst({
        where: {
            id: invoiceId,
            organizationId,
        },
        select: {
            number: true,
            status: true,
            issuedAt: true,
            dueAt: true,
            tax: true,
            total: true,
            currency: true,
            billToName: true,
            kind: true,
            sellerGstin: true,
            // Named as it was at issue (DEC-082); today's name only for a
            // row that froze none.
            sellerName: true,
            organization: { select: { name: true } },
            lines: {
                orderBy: { position: "asc" },
                select: {
                    description: true,
                    quantity: true,
                    unitPrice: true,
                    amount: true,
                    gstRate: true,
                },
            },
        },
    });
    if (!invoice?.number || invoice.status === "DRAFT") notFound();
    const site = await prisma.site.findFirst({
        where: {
            organizationId,
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: { style: true },
    });
    return {
        businessName: printedSeller(invoice, {
            name: invoice.organization.name,
            legalName: null,
            email: null,
        }).name,
        number: invoice.number,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        dueAt: invoice.dueAt?.toISOString() ?? null,
        lines: invoice.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: toMoneyString(l.unitPrice),
            amount: toMoneyString(l.amount),
        })),
        tax: toMoneyString(invoice.tax),
        total: toMoneyString(invoice.total),
        currency: invoice.currency,
        status: invoiceStanding(invoice, new Date()) as Exclude<
            InvoiceStanding,
            "DRAFT"
        >,
        billedTo: invoice.billToName,
        billOfSupply: isBillOfSupply(invoice),
        theme: site ? siteStyleVariables(parseSiteStyle(site.style)) : null,
    };
}

/** Reads per link per minute: a page reload is fine, a scraper is not. */
const READS_PER_WINDOW = 30;
const READ_WINDOW_MS = 60_000;
/** Payment starts per link per ten minutes. */
const PAYS_PER_WINDOW = 10;
const PAY_WINDOW_MS = 10 * 60_000;

const MAX_KEY_LENGTH = 255;

function tooManyRequests(): HttpException {
    return new HttpException(
        "Too many requests for this link. Try again shortly.",
        429,
    );
}

/** Every miss looks the same: unknown, replaced and revoked links alike. */
function notFound(): never {
    throw new NotFoundException("Invoice not found");
}

/**
 * A 409 when the business doesn't take payment online (DEC-070): Payments
 * is off, no provider can open the checkout window, or its plan takes no
 * new online payment — a renewal of a subscription it already has still
 * does. The invoice is still owed; the customer pays the business some
 * other way.
 */
async function assertPaysOnline(
    organizationId: string,
    invoice: { subscriptionId: string | null },
): Promise<void> {
    if (await invoicePayOnline(prisma, organizationId, invoice)) return;
    throw new ConflictException({
        message: NOT_PAID_ONLINE,
        details: { reason: "not-paid-online" },
    });
}

/**
 * The customer's side of an invoice pay link — no session, so everything
 * hangs on the token (ADR-007, U13).
 *
 * The token is found by its hash and nothing else is taken from the request
 * but a provider and an idempotency key: the business, the amount and the
 * currency all come from the stored invoice. An unknown, replaced or revoked
 * token is a 404. The hash lookup runs before any org context exists, so
 * these checks are the guarantee; `runInOrgContext` adds the database's own
 * when row-level security is on (the review link's pattern).
 */
@Injectable()
export class PublicInvoicesService {
    constructor(
        private readonly payments: PaymentsService,
        @Optional()
        private readonly readLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        @Optional()
        private readonly payLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            PAYS_PER_WINDOW,
            PAY_WINDOW_MS,
        ),
        // Autopay on a plan's invoice (D12); absent where a test builds
        // this by hand, and then the page offers none.
        @Optional() private readonly autopay?: AutopayService,
        // "Next autopay charge" (D13B); absent, only a queued charge's.
        @Optional() private readonly charges?: MandateChargesService,
    ) {}

    async read(token: string, callerHash?: string): Promise<PublicInvoiceView> {
        const tokenHash = hashPayToken(token);
        // Keyed on the caller, like the booking and enquiry limiters: a limiter
        // keyed on the token the caller sent throttles nothing, because every
        // new token is a fresh window.
        if (!this.readLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await this.find(tokenHash);
        return runInOrgContext(found.organizationId, async () => {
            const [paper, payOnline] = await Promise.all([
                invoicePaper(found.organizationId, found.id),
                // A link sent before Payments went off opens as a view
                // link: it never errors (DEC-070).
                invoicePayOnline(prisma, found.organizationId, found),
            ]);
            // Autopay only on a plan's invoice that offers it (D12), and
            // only while the business takes payment online.
            const owed =
                paper.status === "ISSUED" || paper.status === "OVERDUE";
            const [autopay, charging, payInstructions] = await Promise.all([
                payOnline ? this.payAutopay(found) : null,
                chargeUnderWayOn(prisma, found.organizationId, found.id),
                // How to pay the business offline (R32): only on an owed
                // invoice the page offers no Pay button for.
                owed && !payOnline
                    ? businessPayInstructionsOf(found.organizationId)
                    : undefined,
            ]);
            // No way to pay set: a way to reach the business instead (UX-007).
            const businessContact =
                payInstructions === null
                    ? await businessContactOf(found.organizationId)
                    : undefined;
            const view: PublicInvoiceView = autopay
                ? { ...paper, payOnline, autopay }
                : { ...paper, payOnline };
            // "Next autopay charge" (D13B): this invoice's planned debit, or
            // once it's paid with autopay on, the next renewal's.
            const next =
                charging || (autopay?.on && paper.status === "PAID")
                    ? await this.nextCharge(found, charging)
                    : null;
            return {
                ...view,
                payUrl: await payLinkUrlFor(found.organizationId, token),
                ...(payInstructions !== undefined ? { payInstructions } : {}),
                ...(businessContact !== undefined ? { businessContact } : {}),
                ...(charging
                    ? { autopayCharging: { at: charging.at.toISOString() } }
                    : {}),
                ...(next
                    ? { autopayNextCharge: { at: next.toISOString() } }
                    : {}),
            };
        });
    }

    /** When autopay next takes money for the invoice's plan (D13B). */
    private async nextCharge(
        found: { id: string; organizationId: string },
        charging: ChargeUnderWay | null,
    ): Promise<Date | null> {
        const invoice = await prisma.invoice.findFirst({
            where: { id: found.id, organizationId: found.organizationId },
            select: {
                subscription: {
                    select: {
                        id: true,
                        organizationId: true,
                        planId: true,
                        pendingPlanId: true,
                        status: true,
                        cancelAtPeriodEnd: true,
                        currentPeriodEnd: true,
                        timezone: true,
                    },
                },
            },
        });
        const sub = invoice?.subscription;
        if (!sub) return null;
        return nextAutopayCharge(this.charges, sub, charging, new Date());
    }

    /**
     * Autopay for the invoice's plan, as the pay page offers it (D12): only
     * a plan's invoice, while the plan runs, and only when the business's
     * provider takes autopay. A provider that can't say is no autopay.
     */
    private async payAutopay(found: {
        id: string;
        organizationId: string;
    }): Promise<PayAutopay | null> {
        if (!this.autopay) return null;
        const invoice = await prisma.invoice.findFirst({
            where: { id: found.id, organizationId: found.organizationId },
            select: {
                source: true,
                currency: true,
                subscription: {
                    select: {
                        id: true,
                        status: true,
                        plan: { select: { name: true } },
                    },
                },
            },
        });
        const sub = invoice?.subscription;
        if (invoice?.source !== "SUBSCRIPTION" || !sub) return null;
        if (sub.status === "CANCELLED") return null;
        const [methods, line, checks] = await Promise.all([
            this.autopay.offer(found.organizationId).catch(() => []),
            this.autopay.line(found.organizationId, sub.id),
            this.autopay
                .checks(found.organizationId, invoice.currency)
                .catch(() => ({})),
        ]);
        const on =
            line?.state === "ON"
                ? { method: line.method, hint: line.hint }
                : null;
        if (methods.length === 0 && !on) return null;
        return { plan: sub.plan.name, methods, on, checks };
    }

    /**
     * "Pay and turn on autopay" (D12): start autopay on the invoice's plan
     * with the method the customer picked. For UPI and card on an unpaid
     * invoice, the window it opens pays the invoice too. The customer comes
     * back to the business's own site (`/autopay`), never Saroh's.
     */
    async startAutopay(
        token: string,
        body: unknown,
        callerHash?: string,
    ): Promise<AutopayStart> {
        const options = parseAutopayBody(body);
        const tokenHash = hashPayToken(token);
        if (!this.payLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await this.find(tokenHash);
        await assertOrganizationOpen(found.organizationId);
        const autopay = this.autopay;
        if (!autopay) {
            throw new ConflictException({
                message: "Autopay isn't available with this business.",
                details: { reason: "not-offered" },
            });
        }
        return runInOrgContext(found.organizationId, async () => {
            await assertPaysOnline(found.organizationId, found);
            const origin = await siteOriginOf(found.organizationId);
            return autopay.startForInvoice({
                organizationId: found.organizationId,
                invoiceId: found.id,
                method: options.method,
                source: "PAY_LINK",
                ...(options.idempotencyKey
                    ? { idempotencyKey: options.idempotencyKey }
                    : {}),
                returnUrl: origin
                    ? `${origin}/autopay?pay=${encodeURIComponent(token)}`
                    : null,
            });
        });
    }

    /**
     * How autopay stands after the customer came back (D12): what the page
     * on the business's site shows. A set-up still waiting is read back
     * from the provider, so the page moves on by itself.
     */
    async autopayOutcome(
        token: string,
        callerHash?: string,
    ): Promise<AutopayOutcome & { payUrl: string }> {
        const tokenHash = hashPayToken(token);
        if (!this.readLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await this.find(tokenHash);
        const autopay = this.autopay;
        if (!autopay) notFound();
        return runInOrgContext(found.organizationId, async () => {
            const invoice = await prisma.invoice.findFirst({
                where: { id: found.id, organizationId: found.organizationId },
                select: { status: true, subscriptionId: true },
            });
            if (!invoice?.subscriptionId) notFound();
            const outcome = await autopay.outcome(
                found.organizationId,
                invoice.subscriptionId,
                invoice.status === "PAID",
            );
            return {
                ...outcome,
                payUrl: await payLinkUrlFor(found.organizationId, token),
            };
        });
    }

    /**
     * Start paying: an intent for the invoice's own total, through the
     * business's own connected provider. `body` is read by hand, not by a
     * DTO, so anything but `provider` and `idempotencyKey` — an `amount`,
     * say — is ignored rather than refused.
     */
    async createIntent(
        token: string,
        body: unknown,
        callerHash?: string,
    ): Promise<CreateIntentResult> {
        const options = parseIntentBody(body);
        const tokenHash = hashPayToken(token);
        // The caller, not the token they sent — see `read`.
        if (!this.payLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await this.find(tokenHash);
        // Paying an invoice already sent is finishing it (DEC-117); a new
        // autopay mandate, below, is not.
        await assertOrganizationWindingDown(found.organizationId);
        return runInOrgContext(found.organizationId, async () => {
            const invoice = await prisma.invoice.findFirst({
                where: {
                    id: found.id,
                    organizationId: found.organizationId,
                },
                select: {
                    id: true,
                    organizationId: true,
                    status: true,
                    total: true,
                    currency: true,
                    source: true,
                    subscriptionId: true,
                    booking: {
                        select: { status: true, holdExpiresAt: true },
                    },
                },
            });
            if (!invoice) notFound();
            // A pay-now hold's invoice (U19) is paid as a draft — it takes
            // its number when the money arrives — and only while the hold
            // lasts: after that its place may be someone else's.
            if (invoice.status === "DRAFT" && invoice.source === "BOOKING") {
                if (
                    !invoice.booking ||
                    holdState(invoice.booking, new Date()) !== "HELD"
                ) {
                    throw new ConflictException(
                        "The time held for you ran out. Pick a time again.",
                    );
                }
                return this.payments.createIntentForInvoicePublic(
                    invoice,
                    options,
                );
            }
            if (invoice.status !== "ISSUED") {
                throw new ConflictException(
                    invoice.status === "PAID"
                        ? "This invoice is already paid."
                        : "This invoice is no longer payable.",
                );
            }
            // A view link (DEC-070): the page offers no Pay, and the API
            // agrees. A booking's pay-now hold above was started online
            // and keeps the provider's own refusal.
            await assertPaysOnline(found.organizationId, invoice);
            // One charge at a time (D13): autopay is charging it.
            if (
                await chargeUnderWayOn(prisma, found.organizationId, invoice.id)
            ) {
                throw autopayChargeInProgress();
            }
            return this.payments.createIntentForInvoicePublic(invoice, options);
        });
    }

    private async find(tokenHash: string): Promise<{
        id: string;
        organizationId: string;
        subscriptionId: string | null;
    }> {
        const row = await prisma.invoice.findUnique({
            where: { payTokenHash: tokenHash },
            select: { id: true, organizationId: true, subscriptionId: true },
        });
        if (!row) notFound();
        return row;
    }
}

/** The autopay request: a method from the offer, and an idempotency key. */
export function parseAutopayBody(body: unknown): {
    method: MandateMethod;
    idempotencyKey?: string;
} {
    const record =
        typeof body === "object" && body !== null
            ? (body as Record<string, unknown>)
            : {};
    const method =
        typeof record.method === "string"
            ? record.method.trim().toUpperCase()
            : "";
    if (!isMandateMethod(method)) {
        throw new BadRequestException("Pick how autopay should pay");
    }
    const { idempotencyKey } = parseIntentBody({
        idempotencyKey: record.idempotencyKey,
    });
    return idempotencyKey ? { method, idempotencyKey } : { method };
}

/** The two fields the public intent request may carry; the rest is ignored. */
export function parseIntentBody(body: unknown): {
    provider?: string;
    idempotencyKey?: string;
} {
    const record =
        typeof body === "object" && body !== null
            ? (body as Record<string, unknown>)
            : {};
    const out: { provider?: string; idempotencyKey?: string } = {};
    if (record.provider !== undefined && record.provider !== null) {
        const provider =
            typeof record.provider === "string"
                ? record.provider.trim().toUpperCase()
                : "";
        if (!isSupportedProvider(provider)) {
            throw new BadRequestException("That payment provider is unknown");
        }
        out.provider = provider;
    }
    if (record.idempotencyKey !== undefined && record.idempotencyKey !== null) {
        if (
            typeof record.idempotencyKey !== "string" ||
            record.idempotencyKey.length > MAX_KEY_LENGTH
        ) {
            throw new BadRequestException("The idempotency key is not valid");
        }
        out.idempotencyKey = record.idempotencyKey;
    }
    return out;
}
