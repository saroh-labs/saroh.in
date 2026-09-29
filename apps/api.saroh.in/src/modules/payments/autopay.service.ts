import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { fromMinor, toMinor } from "../../common/money";
import type { CheckView } from "./authorisation-check";
import { CHECK_VIEW_SELECT, checkViewOf } from "./authorisation-check";
import { mandateLimitCents } from "./mandate-rules";
import type { MandateSetupSource } from "./mandate-setup.service";
import { MandateSetupService } from "./mandate-setup.service";
import type { MandateMethod } from "./providers/provider.port";
import { MANDATE_METHODS } from "./providers/provider.port";

/**
 * A customer turning on autopay for their plan (round-2 D12, DEC-038), from
 * the invoice's pay link, the site's Prices page (the join, G20) or their
 * account. Built on D11's set-up (`mandate-setup.service.ts`):
 *
 * - **Every method the provider offers.** `offer` is the business's
 *   provider's own list (`mandateMethods`), never narrowed (DEC-059). Empty:
 *   autopay isn't offered anywhere — which is every business until D19 gives
 *   Razorpay its mandates.
 * - **One flow with the payment, where the method allows.** UPI and card
 *   authorise with a real first payment (D11 spike), so that payment *is*
 *   the invoice's: the invoice's intent is recorded under the
 *   authorisation's provider order, and that payment's own capture webhook
 *   pays the invoice as a pay link's does. eMandate authorises for ₹0, so
 *   the invoice is paid first as usual and then authorised.
 * - **Nothing owed: the ₹1 check.** UPI and card must take a payment to
 *   authorise, so with nothing to pay the set-up takes the provider's
 *   minimum and refunds it straight away (DEC-064, `authorisation-check.ts`);
 *   the start says so (`check`), and so does the page after.
 * - **A limit with headroom.** `mandateLimitCents` of the larger of the
 *   plan's price and the invoice.
 *
 * The customer's side comes back to a page on the business's own site
 * (`returnUrl`), never Saroh's or the provider's.
 */

/** What the customer is told when autopay isn't offered (409). */
export const AUTOPAY_NOT_OFFERED =
    "Autopay isn't available with this business. Pay this time as usual.";

/** A charge through autopay is under way on the invoice (D13). */
export const AUTOPAY_CHARGE_IN_PROGRESS = "Autopay charge in progress";

/** What the site needs to open the provider's window. Never a secret. */
export interface AutopayHandoff {
    provider: string;
    /**
     * What this window takes now: the invoice (UPI, card), the ₹1 check
     * with nothing owed (UPI, card; refunded), or 0 (eMandate).
     */
    amountCents: number;
    currency: string;
    providerIntentId: string | null;
    publicKey: string | null;
    clientParams: Record<string, unknown>;
}

/** A started set-up: what to open, and where to land after. */
export interface AutopayStart {
    /** The mandate's ref. */
    ref: string;
    method: MandateMethod;
    /**
     * PAY_AND_AUTHORISE: this one window pays the invoice and turns on
     * autopay. AUTHORISE: it only authorises — nothing is kept, though the
     * ₹1 `check` may be taken and handed back.
     */
    mode: "PAY_AND_AUTHORISE" | "AUTHORISE";
    /**
     * The check this window takes to authorise with nothing owed (UPI,
     * card: the provider's minimum), refunded automatically (DEC-064).
     * Null: none. Absent from an API older than D12B.
     */
    check: { amount: string; currency: string } | null;
    /** The most one charge may take, as money. */
    limit: string;
    currency: string;
    handoff: AutopayHandoff;
    /** The provider's hosted page, when it has one instead of a window. */
    authorisationUrl: string | null;
    /** The page on the business's own site to land on after; null: none. */
    returnUrl: string | null;
}

/** How a subscription's autopay stands, for a line of text. */
export interface AutopayLine {
    /** ON: set up and charging. PAUSED: paused in the customer's UPI app. */
    state: "ON" | "PAUSED" | "PENDING" | "FAILED";
    method: MandateMethod | null;
    /** Only what the provider gave as displayable (a masked handle, last four). */
    hint: string | null;
    /** The most one charge may take, as money; null when unknown. */
    limit: string | null;
    currency: string;
    /** When it came on (ON, PAUSED), or was started (PENDING, FAILED). */
    since: string;
    /** FAILED: why, as a short code — never the provider's prose. */
    failure:
        "NOT_APPROVED" | "EXPIRED" | "PROVIDER_REFUSED" | "NO_ANSWER" | null;
    /**
     * The ₹1 check this set-up took, and whether it is back with the
     * customer (DEC-064). Null: none was taken. Never income.
     */
    check: CheckView | null;
}

/** The page after set-up: the plan, its autopay, and what comes next. */
export interface AutopayOutcome {
    plan: string;
    /** Null: no autopay (it never started, or it ended). */
    autopay: AutopayLine | null;
    /**
     * The payment went through: the pay link's invoice is paid, or, from
     * the account, nothing on the plan is owed.
     */
    paid: boolean;
    /** The next renewal; null when it won't renew. */
    nextPaymentAt: string | null;
    nextAmount: string | null;
    currency: string;
    /** The zone the plan's days are in. */
    timezone: string;
}

/** The invoice a set-up starts from: a plan's, found by the caller. */
interface InvoiceRow {
    id: string;
    organizationId: string;
    status: string;
    source: string;
    total: Prisma.Decimal;
    currency: string;
    subscriptionId: string | null;
}

export interface StartForInvoiceInput {
    organizationId: string;
    invoiceId: string;
    method: MandateMethod;
    source: MandateSetupSource;
    accountId?: string | null;
    idempotencyKey?: string;
    returnUrl: string | null;
    now?: Date;
}

export interface StartForSubscriptionInput {
    organizationId: string;
    subscriptionId: string;
    method: MandateMethod;
    source: MandateSetupSource;
    accountId?: string | null;
    idempotencyKey?: string;
    returnUrl: string | null;
    now?: Date;
}

const LIVE_INTENT = ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"];

@Injectable()
export class AutopayService {
    private readonly logger = new Logger(AutopayService.name);

    constructor(private readonly setup: MandateSetupService) {}

    /**
     * The methods a customer of this business can authorise autopay with:
     * every one its provider's account offers, in the provider's order,
     * each once. Empty: autopay isn't offered.
     */
    async offer(organizationId: string): Promise<MandateMethod[]> {
        const offers = await this.setup.mandateMethods(organizationId);
        const methods: MandateMethod[] = [];
        for (const o of offers) {
            for (const m of o.methods)
                if (!methods.includes(m)) methods.push(m);
        }
        return methods;
    }

    /**
     * The check each method takes to authorise when nothing is owed, as
     * money (DEC-064): Razorpay's UPI and card ₹1. A method not here takes
     * none. Told to the customer before they pick.
     */
    async checks(
        organizationId: string,
        currency: string,
    ): Promise<Partial<Record<MandateMethod, AutopayCheck>>> {
        const out: Partial<Record<MandateMethod, AutopayCheck>> = {};
        for (const o of await this.setup.mandateMethods(organizationId)) {
            for (const m of o.methods) {
                const cents = o.checkCents[m];
                if (out[m] === undefined && cents !== undefined && cents > 0) {
                    out[m] = { amount: fromMinor(cents), currency };
                }
            }
        }
        return out;
    }

    /**
     * Turn on autopay from a plan's invoice (the pay link, or the account
     * when something is owed). UPI and card on an unpaid invoice: one
     * window pays it and authorises. eMandate, or an invoice already paid:
     * authorise only. Refused (409) for an invoice that isn't a plan's, a
     * plan that has ended, a business without autopay, a void invoice, or
     * while an autopay charge is under way on it.
     */
    async startForInvoice(input: StartForInvoiceInput): Promise<AutopayStart> {
        const { organizationId } = input;
        const invoice: InvoiceRow | null = await prisma.invoice.findFirst({
            where: { id: input.invoiceId, organizationId },
            select: {
                id: true,
                organizationId: true,
                status: true,
                source: true,
                total: true,
                currency: true,
                subscriptionId: true,
            },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
        if (invoice.source !== "SUBSCRIPTION" || !invoice.subscriptionId) {
            throw new ConflictException({
                message: "Autopay is only for a plan's payments.",
                details: { reason: "not-a-plan" },
            });
        }
        if (invoice.status !== "ISSUED" && invoice.status !== "PAID") {
            throw new ConflictException({
                message: "This invoice is no longer payable.",
                details: { reason: "not-payable" },
            });
        }
        if (input.idempotencyKey) {
            const replay = await this.replay(invoice.id, input.idempotencyKey);
            if (replay) return replay;
        }
        if (await chargeUnderWay(organizationId, invoice.id)) {
            throw new ConflictException({
                message: AUTOPAY_CHARGE_IN_PROGRESS,
                details: { reason: "autopay-pending" },
            });
        }
        const subscription = await this.liveSubscription(
            organizationId,
            invoice.subscriptionId,
        );
        await this.assertOffered(organizationId, input.method);

        const invoiceCents = toMinor(invoice.total);
        const pays =
            input.method !== "EMANDATE" &&
            invoice.status === "ISSUED" &&
            invoiceCents > 0;
        const started = await this.setup.createSetup({
            organizationId,
            subscriptionId: subscription.id,
            method: input.method,
            maxAmountCents: mandateLimitCents(
                Math.max(toMinor(subscription.price), invoiceCents, 1),
            ),
            firstAmountCents: pays ? invoiceCents : 0,
            source: input.source,
            accountId: input.accountId ?? null,
            ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
            ...(input.now ? { now: input.now } : {}),
        });
        const publicKey = await publicKeyOf(organizationId, started.provider);
        const view: AutopayStart = {
            ref: started.mandateId,
            method: started.method,
            mode: pays ? "PAY_AND_AUTHORISE" : "AUTHORISE",
            check: checkOf(started),
            limit: fromMinor(started.maxAmountCents),
            currency: started.currency,
            handoff: {
                provider: started.provider,
                amountCents: pays ? invoiceCents : started.checkCents,
                currency: started.currency,
                providerIntentId: started.setupReference,
                publicKey,
                clientParams: started.clientParams,
            },
            authorisationUrl: started.authorisationUrl,
            returnUrl: input.returnUrl,
        };
        if (pays) {
            await prisma.$transaction((tx) =>
                recordAuthorisationIntent(tx, {
                    organizationId,
                    invoiceId: invoice.id,
                    provider: started.provider,
                    setupReference: started.setupReference,
                    amountCents: invoiceCents,
                    currency: invoice.currency,
                    idempotencyKey: input.idempotencyKey ?? null,
                    start: view,
                }),
            );
        }
        return view;
    }

    /**
     * Turn on autopay for a subscription from the account (A8's My plan):
     * with its oldest unpaid invoice when one is owed — paid in the same
     * window for UPI and card — and otherwise an authorisation alone.
     */
    async startForSubscription(
        input: StartForSubscriptionInput,
    ): Promise<AutopayStart> {
        const { organizationId } = input;
        const subscription = await this.liveSubscription(
            organizationId,
            input.subscriptionId,
        );
        const owed = await prisma.invoice.findFirst({
            where: {
                organizationId,
                subscriptionId: subscription.id,
                status: "ISSUED",
            },
            orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
            select: { id: true },
        });
        if (owed) {
            return this.startForInvoice({ ...input, invoiceId: owed.id });
        }
        await this.assertOffered(organizationId, input.method);
        const started = await this.setup.createSetup({
            organizationId,
            subscriptionId: subscription.id,
            method: input.method,
            maxAmountCents: mandateLimitCents(
                Math.max(toMinor(subscription.price), 1),
            ),
            // Nothing is owed: nothing is kept. UPI and card take the ₹1
            // check to authorise, refunded once captured (DEC-064).
            firstAmountCents: 0,
            source: input.source,
            accountId: input.accountId ?? null,
            ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
            ...(input.now ? { now: input.now } : {}),
        });
        return {
            ref: started.mandateId,
            method: started.method,
            mode: "AUTHORISE",
            check: checkOf(started),
            limit: fromMinor(started.maxAmountCents),
            currency: started.currency,
            handoff: {
                provider: started.provider,
                amountCents: started.checkCents,
                currency: started.currency,
                providerIntentId: started.setupReference,
                publicKey: await publicKeyOf(organizationId, started.provider),
                clientParams: started.clientParams,
            },
            authorisationUrl: started.authorisationUrl,
            returnUrl: input.returnUrl,
        };
    }

    /**
     * How a subscription's autopay stands now: the ACTIVE (or PAUSED)
     * mandate, else its newest set-up if that is waiting or failed. Null:
     * no autopay (never set up, or cancelled — D14 says more).
     *
     * `refresh`: a set-up still waiting is read back from the provider
     * first (its webhook may be late or lost), so a page asking again moves
     * on by itself.
     */
    async line(
        organizationId: string,
        subscriptionId: string,
        opts: { refresh?: boolean; now?: Date } = {},
    ): Promise<AutopayLine | null> {
        const now = opts.now ?? new Date();
        let row = await currentMandate(organizationId, subscriptionId);
        if (
            opts.refresh &&
            row?.status === "PENDING" &&
            !setupLapsed(row, now)
        ) {
            try {
                await this.setup.refresh(organizationId, row.id);
            } catch {
                this.logger.warn(
                    `Mandate ${row.id}: couldn't read it back from the provider; shown as waiting`,
                );
            }
            row = await currentMandate(organizationId, subscriptionId);
        }
        return row ? lineOf(row, now) : null;
    }

    /**
     * Autopay chosen while joining a plan online (G20's pay-first join,
     * DEC-062), for UPI or card: one window pays the join's draft (the
     * first period) and authorises. No subscription exists yet, so no
     * mandate row either: the authorisation is kept on the draft
     * (`join-autopay.ts`) and becomes the mandate when the payment starts
     * the subscription (`plan-join-autopay.ts`). eMandate isn't started
     * here: the join is paid as usual, then authorised from the account.
     */
    async startForJoin(input: {
        organizationId: string;
        contactId: string;
        draft: { id: string; total: Prisma.Decimal; currency: string };
        plan: { name: string; price: string };
        method: MandateMethod;
        idempotencyKey?: string;
        returnUrl: string | null;
        now?: Date;
    }): Promise<{ start: AutopayStart; paymentIntentId: string }> {
        const { organizationId, draft } = input;
        if (input.idempotencyKey) {
            const replay = await this.replayJoin(
                draft.id,
                input.idempotencyKey,
            );
            if (replay) return replay;
        }
        if (input.method === "EMANDATE") {
            throw new ConflictException({
                message:
                    "Pay for the plan first, then set up autopay by bank account.",
                details: { reason: "method" },
            });
        }
        await this.assertOffered(organizationId, input.method);
        const amountCents = toMinor(draft.total);
        const setup = await this.setup.createJoinSetup({
            organizationId,
            contactId: input.contactId,
            method: input.method,
            maxAmountCents: mandateLimitCents(
                Math.max(toMinor(input.plan.price), amountCents, 1),
            ),
            firstAmountCents: amountCents,
            currency: draft.currency,
            description: `Autopay for ${input.plan.name}`,
            ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
            ...(input.now ? { now: input.now } : {}),
        });
        const start: AutopayStart = {
            ref: setup.mandateId,
            method: setup.method,
            mode: "PAY_AND_AUTHORISE",
            check: null,
            limit: fromMinor(setup.maxAmountCents),
            currency: setup.currency,
            handoff: {
                provider: setup.provider,
                amountCents,
                currency: draft.currency,
                providerIntentId: setup.setupReference,
                publicKey: await publicKeyOf(organizationId, setup.provider),
                clientParams: setup.clientParams,
            },
            authorisationUrl: setup.authorisationUrl,
            returnUrl: input.returnUrl,
        };
        const paymentIntentId = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${draft.id} AND "organizationId" = ${organizationId} FOR UPDATE`;
            const row = await tx.invoice.findFirst({
                where: { id: draft.id, organizationId, status: "DRAFT" },
                select: { planTerms: true },
            });
            const terms = row?.planTerms;
            if (!terms || typeof terms !== "object" || Array.isArray(terms)) {
                throw new ConflictException({
                    message:
                        "This payment has closed, so you haven't joined. Start again to join.",
                    details: { reason: "closed" },
                });
            }
            await tx.invoice.update({
                where: { id: draft.id },
                data: {
                    planTerms: {
                        ...terms,
                        autopay: {
                            mandateId: setup.mandateId,
                            provider: setup.provider,
                            method: setup.method,
                            maxAmountCents: setup.maxAmountCents,
                            currency: setup.currency,
                            frequency: setup.frequency,
                            providerCustomerId: setup.providerCustomerId,
                            setupReference: setup.setupReference,
                            expiresAt: setup.expiresAt.toISOString(),
                            setupExpiresAt: setup.setupExpiresAt.toISOString(),
                        },
                    },
                },
            });
            return recordAuthorisationIntent(tx, {
                organizationId,
                invoiceId: draft.id,
                provider: setup.provider,
                setupReference: setup.setupReference,
                amountCents,
                currency: draft.currency,
                idempotencyKey: input.idempotencyKey ?? null,
                start,
            });
        });
        return { start, paymentIntentId };
    }

    /**
     * What the page the customer lands on after setting up says: the plan,
     * how its autopay stands (read back from the provider while it waits),
     * whether the payment went through, and the next renewal.
     */
    async outcome(
        organizationId: string,
        subscriptionId: string,
        paid: boolean,
        now: Date = new Date(),
    ): Promise<AutopayOutcome> {
        const sub = await prisma.customerSubscription.findFirst({
            where: { id: subscriptionId, organizationId },
            select: {
                status: true,
                cancelAtPeriodEnd: true,
                currentPeriodEnd: true,
                price: true,
                currency: true,
                timezone: true,
                plan: { select: { name: true } },
            },
        });
        if (!sub) throw new NotFoundException("Subscription not found");
        const renews = sub.status === "ACTIVE" && !sub.cancelAtPeriodEnd;
        return {
            plan: sub.plan.name,
            autopay: await this.line(organizationId, subscriptionId, {
                refresh: true,
                now,
            }),
            paid,
            nextPaymentAt: renews ? sub.currentPeriodEnd.toISOString() : null,
            nextAmount: renews ? fromMinor(toMinor(sub.price)) : null,
            currency: sub.currency,
            timezone: sub.timezone,
        };
    }

    private async liveSubscription(
        organizationId: string,
        subscriptionId: string,
    ): Promise<{ id: string; price: Prisma.Decimal }> {
        const subscription = await prisma.customerSubscription.findFirst({
            where: { id: subscriptionId, organizationId },
            select: { id: true, status: true, price: true },
        });
        if (!subscription) {
            throw new NotFoundException("Subscription not found");
        }
        if (subscription.status === "CANCELLED") {
            throw new ConflictException({
                message:
                    "This plan has ended, so autopay can't be set up for it.",
                details: { reason: "ended" },
            });
        }
        return subscription;
    }

    private async assertOffered(
        organizationId: string,
        method: MandateMethod,
    ): Promise<void> {
        const methods = await this.offer(organizationId);
        if (methods.length === 0) {
            throw new ConflictException({
                message: AUTOPAY_NOT_OFFERED,
                details: { reason: "not-offered" },
            });
        }
        if (!methods.includes(method)) {
            throw new ConflictException({
                message:
                    "That way to pay isn't available for autopay with this business.",
                details: { reason: "method" },
            });
        }
    }

    /** A join's autopay start already made with this key. */
    private async replayJoin(
        invoiceId: string,
        idempotencyKey: string,
    ): Promise<{ start: AutopayStart; paymentIntentId: string } | null> {
        const intent = await prisma.paymentIntent.findUnique({
            where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey } },
            select: { id: true },
        });
        if (!intent) return null;
        const start = await this.replay(invoiceId, idempotencyKey);
        return start ? { start, paymentIntentId: intent.id } : null;
    }

    /** A start already made with this key, for a retried request. */
    private async replay(
        invoiceId: string,
        idempotencyKey: string,
    ): Promise<AutopayStart | null> {
        const intent = await prisma.paymentIntent.findUnique({
            where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey } },
            select: {
                attempts: {
                    orderBy: { createdAt: "asc" },
                    take: 1,
                    select: { rawResponse: true },
                },
            },
        });
        if (!intent) return null;
        const start = readStoredStart(intent.attempts[0]?.rawResponse);
        if (!start) {
            throw new ConflictException({
                message: "That payment was already started another way.",
                details: { reason: "key-used" },
            });
        }
        return start;
    }
}

/**
 * Record the invoice's payment under an authorisation's provider order
 * (UPI, card): its capture webhook then pays the invoice as a pay link's
 * does (`webhooks.service.ts`, by `providerIntentId`). Not a mandate charge
 * (`viaMandateId` stays null): it is the customer paying while they
 * authorise. The start is kept on the attempt so a retried request gets the
 * same window back.
 */
export async function recordAuthorisationIntent(
    db: Pick<Prisma.TransactionClient, "paymentIntent" | "paymentAttempt">,
    input: {
        organizationId: string;
        invoiceId: string;
        provider: string;
        setupReference: string;
        amountCents: number;
        currency: string;
        idempotencyKey: string | null;
        start: AutopayStart;
    },
): Promise<string> {
    const intent = await db.paymentIntent.create({
        data: {
            organizationId: input.organizationId,
            invoiceId: input.invoiceId,
            provider: input.provider,
            providerIntentId: input.setupReference,
            amountCents: input.amountCents,
            currency: input.currency,
            status: "REQUIRES_PAYMENT",
            idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
    });
    await db.paymentAttempt.create({
        data: {
            organizationId: input.organizationId,
            paymentIntentId: intent.id,
            provider: input.provider,
            providerRef: input.setupReference,
            status: "CREATED",
            rawResponse: {
                providerIntentId: input.setupReference,
                clientParams: input.start.handoff.clientParams,
                autopay: storedStart(input.start),
            } as Prisma.InputJsonValue,
        },
    });
    return intent.id;
}

function storedStart(start: AutopayStart): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(start)) as Prisma.InputJsonValue;
}

function readStoredStart(
    raw: Prisma.JsonValue | undefined,
): AutopayStart | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const a = (raw as Record<string, unknown>).autopay;
    if (!a || typeof a !== "object" || Array.isArray(a)) return null;
    const s = a as Partial<AutopayStart>;
    return typeof s.ref === "string" &&
        typeof s.mode === "string" &&
        s.handoff &&
        typeof s.handoff === "object"
        ? (s as AutopayStart)
        : null;
}

/** A check to take, as money: what the start tells the customer. */
export interface AutopayCheck {
    /** "1.00" */
    amount: string;
    currency: string;
}

function checkOf(started: {
    checkCents: number;
    currency: string;
}): AutopayCheck | null {
    return started.checkCents > 0
        ? { amount: fromMinor(started.checkCents), currency: started.currency }
        : null;
}

/** The connection's public key (Razorpay's key id), for the window. */
async function publicKeyOf(
    organizationId: string,
    provider: string,
): Promise<string | null> {
    const row = await prisma.merchantPaymentProvider.findUnique({
        where: { organizationId_provider: { organizationId, provider } },
        select: { publicKey: true },
    });
    return row?.publicKey ?? null;
}

/** An autopay charge is waiting on this invoice (D13): nothing else charges it. */
export async function chargeUnderWay(
    organizationId: string,
    invoiceId: string,
): Promise<boolean> {
    const found = await prisma.paymentIntent.findFirst({
        where: {
            organizationId,
            invoiceId,
            viaMandateId: { not: null },
            status: { in: LIVE_INTENT },
        },
        select: { id: true },
    });
    return found !== null;
}

interface MandateRow {
    id: string;
    status: string;
    method: string | null;
    displayHint: string | null;
    maxAmountCents: number | null;
    currency: string;
    createdAt: Date;
    activatedAt: Date | null;
    setupExpiresAt: Date | null;
    failureReason: string | null;
    authorisationChecks?: Parameters<typeof checkViewOf>[0][];
}

const MANDATE_SELECT = {
    id: true,
    status: true,
    method: true,
    displayHint: true,
    maxAmountCents: true,
    currency: true,
    createdAt: true,
    activatedAt: true,
    setupExpiresAt: true,
    failureReason: true,
    authorisationChecks: { select: CHECK_VIEW_SELECT, take: 1 },
} as const;

/**
 * The mandate a subscription's autopay is read from: the ACTIVE or PAUSED
 * one, else the newest set-up, when that is waiting or failed.
 */
async function currentMandate(
    organizationId: string,
    subscriptionId: string,
): Promise<MandateRow | null> {
    const live = await prisma.paymentMandate.findFirst({
        where: {
            organizationId,
            subscriptionId,
            status: { in: ["ACTIVE", "PAUSED"] },
        },
        orderBy: { createdAt: "desc" },
        select: MANDATE_SELECT,
    });
    if (live) return live;
    const newest = await prisma.paymentMandate.findFirst({
        where: { organizationId, subscriptionId },
        orderBy: { createdAt: "desc" },
        select: MANDATE_SELECT,
    });
    return newest && (newest.status === "PENDING" || newest.status === "FAILED")
        ? newest
        : null;
}

function setupLapsed(row: Pick<MandateRow, "setupExpiresAt">, now: Date) {
    return row.setupExpiresAt !== null && row.setupExpiresAt <= now;
}

const isMethod = (v: string | null): v is MandateMethod =>
    v !== null && (MANDATE_METHODS as readonly string[]).includes(v);

/** A mandate row as a line; a set-up whose time ran out reads as failed. */
export function lineOf(row: MandateRow, now: Date): AutopayLine {
    const base = {
        method: isMethod(row.method) ? row.method : null,
        hint: row.displayHint,
        limit:
            row.maxAmountCents === null ? null : fromMinor(row.maxAmountCents),
        currency: row.currency,
        check: checkViewOf(row.authorisationChecks?.[0]),
    };
    switch (row.status) {
        case "ACTIVE":
        case "PAUSED":
            return {
                ...base,
                state: row.status === "ACTIVE" ? "ON" : "PAUSED",
                since: (row.activatedAt ?? row.createdAt).toISOString(),
                failure: null,
            };
        case "PENDING":
            return setupLapsed(row, now)
                ? {
                      ...base,
                      state: "FAILED",
                      since: row.createdAt.toISOString(),
                      failure: "EXPIRED",
                  }
                : {
                      ...base,
                      state: "PENDING",
                      since: row.createdAt.toISOString(),
                      failure: null,
                  };
        default:
            return {
                ...base,
                state: "FAILED",
                since: row.createdAt.toISOString(),
                failure: failureOf(row.failureReason),
            };
    }
}

function failureOf(reason: string | null): AutopayLine["failure"] {
    if (reason === "SETUP_REFUSED") return "PROVIDER_REFUSED";
    if (reason === "SETUP_UNANSWERED") return "NO_ANSWER";
    return "NOT_APPROVED";
}
