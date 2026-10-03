import {
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { BillingCheckout, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { stateCode, stateName } from "../invoices/gst-states";
import { formatSellerAddress } from "../invoices/order-invoice";
import { authorize } from "../organizations/organization-policy";
import { enqueueBillingEmail } from "./billing-email.job";
import { periodStart as periodStartOf } from "./checkout-quote";
import type { ParsedBillingEvent } from "./providers/billing-provider.port";
import { renderSarohInvoicePdf } from "./saroh-invoice-paper";
import type { SarohInvoiceSource, SarohLineInput } from "./saroh-invoice-terms";
import {
    samePeriodWindow,
    sarohInvoiceNumber,
    sarohSeries,
    sarohSupply,
    taxSarohLines,
} from "./saroh-invoice-terms";
import type { SarohSeller } from "./saroh-seller";
import { sarohSeller, sellerGaps } from "./saroh-seller";

type Tx = Prisma.TransactionClient;

/** DI token: Saroh as seller, for a test to give made-up details. */
export const SAROH_SELLER = Symbol("SAROH_SELLER");

/** One charge to invoice; every amount is the server's (KTD-18). */
export interface ChargeToInvoice {
    organizationId: string;
    source: SarohInvoiceSource;
    /** Once per charge: a second call with the same key writes nothing. */
    chargeKey: string;
    provider: string;
    providerSubscriptionId: string | null;
    providerEventId: string;
    providerPaymentId?: string | null;
    checkoutId?: string | null;
    planId: string | null;
    planName: string;
    cycle: "month" | "year";
    periodStart: Date | null;
    periodEnd: Date | null;
    lines: SarohLineInput[];
    /** As given at checkout; null: the business profile's. */
    billTo: { state: string | null; gstin: string | null } | null;
    issuedAt: Date;
}

/** `GET …/billing/invoices`: one of Saroh's invoices to the business. */
export interface SarohInvoiceView {
    id: string;
    number: string;
    issuedAt: string;
    source: string;
    planName: string;
    cycle: string;
    periodStart: string | null;
    periodEnd: string | null;
    currency: string;
    taxablePaise: number;
    taxPaise: number;
    totalPaise: number;
}

/**
 * Saroh's own invoices to businesses (pricing catalogue U17, R9): a GST
 * invoice for every charge Saroh takes for a plan, numbered in Saroh's own
 * series, with Saroh's GSTIN and SAC from configuration and the GST split by
 * the business's state, emailed with its PDF.
 *
 * **Written with the charge.** The billing webhook calls the `…InTx`
 * methods on its own transaction, under the subscription's row lock, so the
 * inbox row, the subscription's change and the invoice commit together: a
 * failed invoice rolls the event back and the provider's retry writes it.
 * Each charge has one key (`chargeKey`), checked before a number is taken,
 * so a redelivered event, or the `activated` and `charged` Razorpay sends
 * for one payment, never makes a second invoice or burns a number.
 *
 * **After money, nothing is refused** (DEC-068): a business with no
 * address still gets its invoice; Saroh's own details missing are logged
 * (`saroh_invoice_seller_incomplete`) and the paper is an "Invoice".
 *
 * The email is a `billing.email` job written on the same transaction, so a
 * mail provider that is down never stops the invoice; the job retries.
 */
@Injectable()
export class SarohInvoicesService {
    private readonly logger = new Logger(SarohInvoicesService.name);

    constructor(
        @Optional()
        @Inject(SAROH_SELLER)
        private readonly seller?: SarohSeller,
    ) {}

    private sellerNow(): SarohSeller {
        return this.seller ?? sarohSeller();
    }

    // ── The webhook's hooks ────────────────────────────────────────────

    /**
     * A checkout's charge: a new plan's first period (NEW), an upgrade's
     * difference for the rest of the period (UPGRADE), or a scheduled
     * change's first period (SCHEDULED). Nothing for a checkout that only
     * authorised (a SCHEDULED one waiting for its date).
     */
    async invoiceCheckoutChargeInTx(
        tx: Tx,
        input: {
            checkout: BillingCheckout;
            event: ParsedBillingEvent;
            now: Date;
            source: "NEW" | "UPGRADE" | "SCHEDULED";
            /** The end of the period now paid (NEW, SCHEDULED). */
            periodEnd: Date | null;
            /** The plan it moved up from (UPGRADE), for the line. */
            fromPlanName?: string | null;
        },
    ): Promise<string | null> {
        const { checkout, event, now, source } = input;
        const cycle = checkout.cycle === "year" ? "year" : "month";
        const plan = await tx.plan.findUnique({
            where: { id: checkout.planId },
            select: { name: true },
        });
        const planName = plan?.name ?? "Plan";
        const seller = this.sellerNow();

        if (source === "UPGRADE") {
            if (checkout.chargeNowPaise <= 0) return null;
            return this.recordInTx(tx, {
                organizationId: checkout.organizationId,
                source,
                chargeKey: `upgrade:${checkout.id}`,
                provider: checkout.provider,
                providerSubscriptionId: checkout.providerSubscriptionId,
                providerEventId: event.providerEventId,
                providerPaymentId: event.providerPaymentId ?? null,
                checkoutId: checkout.id,
                planId: checkout.planId,
                planName,
                cycle,
                periodStart: now,
                periodEnd: checkout.startAt,
                lines: [
                    {
                        description: input.fromPlanName
                            ? `${planName}: the rest of this period, up from ${input.fromPlanName}`
                            : `${planName}: the rest of this period`,
                        sac: seller.sac,
                        unitPaise: checkout.chargeNowPaise,
                    },
                ],
                billTo: billToOf(checkout),
                issuedAt: now,
            });
        }

        const end = input.periodEnd;
        if (!end) return null;
        return this.recordInTx(tx, {
            organizationId: checkout.organizationId,
            source,
            chargeKey: periodKey(
                checkout.provider,
                checkout.providerSubscriptionId,
                end,
            ),
            provider: checkout.provider,
            providerSubscriptionId: checkout.providerSubscriptionId,
            providerEventId: event.providerEventId,
            providerPaymentId: event.providerPaymentId ?? null,
            checkoutId: checkout.id,
            planId: checkout.planId,
            planName,
            cycle,
            periodStart: periodStartOf(end, cycle),
            periodEnd: end,
            lines: [planLine(planName, cycle, checkout.pricePaise, seller)],
            billTo: billToOf(checkout),
            issuedAt: now,
        });
    }

    /**
     * A charge on the subscription's own provider subscription — a renewal,
     * or the first charge of a scheduled change the sweep applied first —
     * on the plan it was billed on before the webhook moved anything, for
     * the period the event says is now paid. Nothing when the event names no
     * period end, or that period of this provider subscription is already
     * invoiced (a second event for one payment).
     */
    async invoiceRenewalInTx(
        tx: Tx,
        input: {
            organizationId: string;
            subscription: {
                provider: string | null;
                providerSubscriptionId: string | null;
                plan: {
                    id: string;
                    name: string;
                    interval: string;
                    priceCents: number;
                };
            };
            event: ParsedBillingEvent;
            now: Date;
        },
    ): Promise<string | null> {
        const { subscription: sub, event, now } = input;
        const end = event.currentPeriodEnd;
        if (!end || !sub.provider || !sub.providerSubscriptionId) return null;
        if (sub.plan.priceCents <= 0) return null;
        const cycle = sub.plan.interval === "year" ? "year" : "month";
        const invoiced = await tx.sarohInvoice.findFirst({
            where: {
                organizationId: input.organizationId,
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
                periodEnd: samePeriodWindow(end, cycle),
            },
            select: { id: true },
        });
        if (invoiced) return null;
        const checkout = await tx.billingCheckout.findUnique({
            where: {
                provider_providerSubscriptionId: {
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                },
            },
        });
        // A scheduled change's first charge, when the sweep moved it first.
        const first =
            checkout?.kind === "SCHEDULED" &&
            !(await tx.sarohInvoice.findFirst({
                where: {
                    organizationId: input.organizationId,
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                },
                select: { id: true },
            }));
        return this.recordInTx(tx, {
            organizationId: input.organizationId,
            source: first ? "SCHEDULED" : "RENEWAL",
            chargeKey: periodKey(sub.provider, sub.providerSubscriptionId, end),
            provider: sub.provider,
            providerSubscriptionId: sub.providerSubscriptionId,
            providerEventId: event.providerEventId,
            providerPaymentId: event.providerPaymentId ?? null,
            checkoutId: checkout?.id ?? null,
            planId: sub.plan.id,
            planName: sub.plan.name,
            cycle,
            periodStart: periodStartOf(end, cycle),
            periodEnd: end,
            lines: [
                planLine(
                    sub.plan.name,
                    cycle,
                    sub.plan.priceCents,
                    this.sellerNow(),
                ),
            ],
            billTo: checkout ? billToOf(checkout) : null,
            issuedAt: now,
        });
    }

    /**
     * A charge failed: the provider is retrying (`final` false, PAST_DUE)
     * or gave up and the business is on Free (`final` true). Emailed by the
     * `billing.email` job, which re-reads the subscription first.
     */
    async paymentFailedInTx(
        tx: Tx,
        input: {
            organizationId: string;
            subscriptionId: string;
            providerEventId: string;
            final: boolean;
        },
    ): Promise<void> {
        await enqueueBillingEmail(tx, {
            kind: "PAYMENT_FAILED",
            organizationId: input.organizationId,
            subscriptionId: input.subscriptionId,
            eventKey: input.providerEventId,
            final: input.final,
        });
    }

    // ── Writing one ─────────────────────────────────────────────────────

    /**
     * Write the invoice for one charge and queue its email, on the caller's
     * transaction. Returns its id, or null when this charge already has
     * one. The caller holds the subscription's row lock, so two deliveries
     * for one charge take turns and the second finds the first.
     */
    async recordInTx(tx: Tx, charge: ChargeToInvoice): Promise<string | null> {
        const existing = await tx.sarohInvoice.findUnique({
            where: { chargeKey: charge.chargeKey },
            select: { id: true },
        });
        if (existing) return null;

        const seller = this.sellerNow();
        const gaps = sellerGaps(seller);
        if (gaps.length) {
            this.logger.warn(
                `saroh_invoice_seller_incomplete missing=${gaps.join(",")}`,
            );
        }

        const [org, profile] = await Promise.all([
            tx.organization.findUnique({
                where: { id: charge.organizationId },
                select: { name: true },
            }),
            tx.businessProfile.findUnique({
                where: { organizationId: charge.organizationId },
                select: {
                    legalName: true,
                    gstRegistered: true,
                    taxId: true,
                    gstState: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    postalCode: true,
                },
            }),
        ]);
        const profileGstin =
            profile?.gstRegistered && profile.taxId ? profile.taxId : null;
        const billToGstin = charge.billTo?.gstin ?? profileGstin;
        const billToState =
            charge.billTo?.state ??
            (charge.billTo?.gstin ? charge.billTo.gstin.slice(0, 2) : null);
        const supply = sarohSupply({
            billToState,
            billToGstin,
            profileState: profile?.gstState ?? null,
            sellerState: seller.state,
        });
        const { lines, totals } = taxSarohLines(charge.lines, supply.taxType);

        const series = sarohSeries(seller.prefix, charge.issuedAt);
        const counted = await tx.$queryRaw<{ last: number }[]>`
            INSERT INTO "SarohInvoiceSequence" ("series", "last", "updatedAt")
            VALUES (${series}, 1, now())
            ON CONFLICT ("series") DO UPDATE
              SET "last" = "SarohInvoiceSequence"."last" + 1, "updatedAt" = now()
            RETURNING "last"`;
        const n = Number(counted[0]?.last ?? 1);

        const invoice = await tx.sarohInvoice.create({
            data: {
                organizationId: charge.organizationId,
                number: sarohInvoiceNumber(series, n),
                series,
                chargeKey: charge.chargeKey,
                source: charge.source,
                provider: charge.provider,
                providerSubscriptionId: charge.providerSubscriptionId,
                providerEventId: charge.providerEventId,
                providerPaymentId: charge.providerPaymentId ?? null,
                checkoutId: charge.checkoutId ?? null,
                planId: charge.planId,
                planName: charge.planName,
                cycle: charge.cycle,
                periodStart: charge.periodStart,
                periodEnd: charge.periodEnd,
                issuedAt: charge.issuedAt,
                sellerName: seller.name,
                sellerLegalName: seller.legalName,
                sellerGstin: seller.gstin,
                sellerState: seller.state,
                sellerAddress: seller.address,
                sellerEmail: seller.email,
                billToName: buyerName(profile?.legalName, org?.name),
                billToEmail: null,
                billToAddress: profile
                    ? formatSellerAddress({
                          ...profile,
                          stateName: stateName(profile.gstState),
                      })
                    : null,
                billToState:
                    stateCode(billToState) ??
                    stateCode(billToGstin?.slice(0, 2)) ??
                    stateCode(profile?.gstState) ??
                    null,
                billToGstin,
                placeOfSupply: supply.placeOfSupply,
                taxType: supply.taxType,
                ...totals,
                lines: {
                    // The invoice's key carries its organizationId too.
                    create: lines.map((l, position) => ({ position, ...l })),
                },
            },
            select: { id: true, number: true },
        });
        await enqueueBillingEmail(tx, {
            kind: "INVOICE",
            organizationId: charge.organizationId,
            invoiceId: invoice.id,
        });
        this.logger.log(
            `saroh_invoice_written org=${charge.organizationId} number=${invoice.number} source=${charge.source}`,
        );
        return invoice.id;
    }

    // ── Reading them ────────────────────────────────────────────────────

    /** The business's invoices from Saroh, newest first. `billing:read`. */
    async list(ctx: OrganizationContext): Promise<SarohInvoiceView[]> {
        authorize(ctx, "billing:read");
        const rows = await prisma.sarohInvoice.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: [{ issuedAt: "desc" }, { number: "desc" }],
            take: 120,
        });
        return rows.map((r) => ({
            id: r.id,
            number: r.number,
            issuedAt: r.issuedAt.toISOString(),
            source: r.source,
            planName: r.planName,
            cycle: r.cycle,
            periodStart: r.periodStart?.toISOString() ?? null,
            periodEnd: r.periodEnd?.toISOString() ?? null,
            currency: r.currency,
            taxablePaise: r.taxablePaise,
            taxPaise: r.taxPaise,
            totalPaise: r.totalPaise,
        }));
    }

    /** One invoice's PDF, drawn on request and never stored. `billing:read`. */
    async pdf(
        ctx: OrganizationContext,
        invoiceId: string,
    ): Promise<{ file: Buffer; fileName: string }> {
        authorize(ctx, "billing:read");
        const invoice = await prisma.sarohInvoice.findFirst({
            where: { id: invoiceId, organizationId: ctx.organizationId },
            include: { lines: true },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
        return renderSarohInvoicePdf(invoice);
    }
}

/** The registered (legal) name, else the business's name. */
function buyerName(
    legalName: string | null | undefined,
    name: string | null | undefined,
): string {
    for (const n of [legalName, name]) {
        const t = n?.trim();
        if (t) return t;
    }
    return "Your business";
}

function periodKey(
    provider: string,
    providerSubscriptionId: string,
    end: Date,
): string {
    return `period:${provider}:${providerSubscriptionId}:${end.toISOString()}`;
}

function billToOf(checkout: BillingCheckout): {
    state: string | null;
    gstin: string | null;
} | null {
    if (!checkout.billToState && !checkout.billToGstin) return null;
    return { state: checkout.billToState, gstin: checkout.billToGstin };
}

function planLine(
    planName: string,
    cycle: "month" | "year",
    pricePaise: number,
    seller: SarohSeller,
): SarohLineInput {
    return {
        description: `${planName} plan, ${cycle === "year" ? "yearly" : "monthly"}`,
        sac: seller.sac,
        unitPaise: pricePaise,
    };
}
