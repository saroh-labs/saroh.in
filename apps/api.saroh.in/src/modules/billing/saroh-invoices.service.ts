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
import { stateCode } from "../invoices/gst-states";
import { formatSellerAddress } from "../invoices/order-invoice";
import { authorize } from "../organizations/organization-policy";
import { chargedAddonRowsInTx } from "./addon-charges";
import { nonEmpty } from "./billing-details";
import { enqueueBillingEmail } from "./billing-email.job";
import { periodStart as periodStartOf } from "./checkout-quote";
import { keepProviderAmountInTx } from "./invoice-amount";
import { enqueuePaymentNotes } from "./payment-notes.job";
import type { ParsedBillingEvent } from "./providers/billing-provider.port";
import { renderSarohInvoicePdf } from "./saroh-invoice-paper";
import type { SarohInvoiceSource, SarohLineInput } from "./saroh-invoice-terms";
import {
    FIRST_MONTH_KEY,
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
    /**
     * What the provider says the payment was, in paise (DEC-166): kept on
     * the invoice and checked against its total. Only with the payment.
     */
    providerAmountPaise?: number | null;
    /** The business as the provider's customer; null: the subscription's. */
    providerCustomerId?: string | null;
    checkoutId?: string | null;
    planId: string | null;
    planName: string;
    cycle: "month" | "year";
    periodStart: Date | null;
    periodEnd: Date | null;
    lines: SarohLineInput[];
    /**
     * As given at checkout; null: the billing profile's. Read only for a
     * checkout made before profiles: one made on a profile saved it there.
     */
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
                providerAmountPaise: event.paymentAmountPaise ?? null,
                providerCustomerId: customerOf(checkout, event),
                checkoutId: checkout.id,
                planId: checkout.planId,
                planName,
                cycle,
                periodStart: now,
                periodEnd: checkout.startAt,
                lines: [
                    {
                        description: input.fromPlanName
                            ? `${seller.name} ${planName} Plan — Upgrade from ${input.fromPlanName}, rest of this period`
                            : `${seller.name} ${planName} Plan — Rest of this period`,
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
        const start = periodStartOf(end, cycle);
        // A coupon takes its discount off the first charge (U16).
        const plan0 = planLine(planName, cycle, checkout.pricePaise, seller);
        if (checkout.discountCharges > 0) {
            plan0.discountPaise = checkout.discountPaise;
        }
        // A scheduled change's first charge carries the add-ons owed (U16).
        const addons = await this.addonLinesInTx(tx, {
            organizationId: checkout.organizationId,
            provider: checkout.provider,
            providerSubscriptionId: checkout.providerSubscriptionId,
            chargedAt: start,
            cycle,
        });
        const id = await this.recordInTx(tx, {
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
            providerAmountPaise: event.paymentAmountPaise ?? null,
            providerCustomerId: customerOf(checkout, event),
            checkoutId: checkout.id,
            planId: checkout.planId,
            planName,
            cycle,
            periodStart: start,
            periodEnd: end,
            lines: [plan0, ...addons.lines],
            billTo: billToOf(checkout),
            issuedAt: now,
        });
        await this.markAddonsInvoiced(tx, addons.rowIds, id);
        return id;
    }

    /**
     * A plan's nominal first month (DEC-093), taken as the mandate was
     * authorised: one line for the days to the trial's end, once per
     * checkout (`first-month:<checkout>`). Written as a new plan's first
     * invoice; the first full charge, at the trial's end, is still read as
     * the plan's first (`invoiceRenewalInTx` leaves this one out).
     */
    async invoiceFirstMonthInTx(
        tx: Tx,
        input: {
            checkout: BillingCheckout;
            event: ParsedBillingEvent;
            now: Date;
        },
    ): Promise<string | null> {
        const { checkout, event, now } = input;
        if (checkout.kind !== "TRIAL" || checkout.chargeNowPaise <= 0) {
            return null;
        }
        const plan = await tx.plan.findUnique({
            where: { id: checkout.planId },
            select: { name: true },
        });
        const planName = plan?.name ?? "Plan";
        return this.recordInTx(tx, {
            organizationId: checkout.organizationId,
            source: "NEW",
            chargeKey: `${FIRST_MONTH_KEY}${checkout.id}`,
            provider: checkout.provider,
            providerSubscriptionId: checkout.providerSubscriptionId,
            providerEventId: event.providerEventId,
            providerPaymentId: event.providerPaymentId ?? null,
            providerAmountPaise: event.paymentAmountPaise ?? null,
            providerCustomerId: customerOf(checkout, event),
            checkoutId: checkout.id,
            planId: checkout.planId,
            planName,
            cycle: "month",
            periodStart: now,
            periodEnd: checkout.startAt,
            lines: [
                {
                    description: `${this.sellerNow().name} ${planName} Plan — First Month Subscription`,
                    sac: this.sellerNow().sac,
                    unitPaise: checkout.chargeNowPaise,
                },
            ],
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
        if (invoiced) {
            // The confirm path may have written it with no payment id (a
            // subscription's lookup names none): this charge's event does.
            await this.fillProviderIdsInTx(tx, invoiced.id, event);
            return null;
        }
        const checkout = await tx.billingCheckout.findUnique({
            where: {
                provider_providerSubscriptionId: {
                    provider: sub.provider,
                    providerSubscriptionId: sub.providerSubscriptionId,
                },
            },
        });
        // Charges of this provider subscription already invoiced, an
        // upgrade's difference and a nominal first month aside: this one is
        // the next.
        const before = await tx.sarohInvoice.count({
            where: {
                organizationId: input.organizationId,
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
                source: { not: "UPGRADE" },
                NOT: { chargeKey: { startsWith: FIRST_MONTH_KEY } },
            },
        });
        // A scheduled change's first charge, when the sweep moved it first;
        // a trial's first charge, at its end, is a new plan's first (U16).
        const firstOf =
            before === 0 && checkout?.kind === "SCHEDULED"
                ? "SCHEDULED"
                : before === 0 && checkout?.kind === "TRIAL"
                  ? "NEW"
                  : null;
        const line = planLine(
            sub.plan.name,
            cycle,
            sub.plan.priceCents,
            this.sellerNow(),
        );
        // A coupon's months (U16): off each of the provider subscription's
        // first charges, as the provider was told to.
        if (checkout && before < checkout.discountCharges) {
            line.discountPaise = checkout.discountPaise;
        }
        const chargedAt = periodStartOf(end, cycle);
        const addons = await this.addonLinesInTx(tx, {
            organizationId: input.organizationId,
            provider: sub.provider,
            providerSubscriptionId: sub.providerSubscriptionId,
            chargedAt,
            cycle,
        });
        const id = await this.recordInTx(tx, {
            organizationId: input.organizationId,
            source: firstOf ?? "RENEWAL",
            chargeKey: periodKey(sub.provider, sub.providerSubscriptionId, end),
            provider: sub.provider,
            providerSubscriptionId: sub.providerSubscriptionId,
            providerEventId: event.providerEventId,
            providerPaymentId: event.providerPaymentId ?? null,
            providerAmountPaise: event.paymentAmountPaise ?? null,
            providerCustomerId:
                event.providerCustomerId ??
                checkout?.providerCustomerId ??
                null,
            checkoutId: checkout?.id ?? null,
            planId: sub.plan.id,
            planName: sub.plan.name,
            cycle,
            periodStart: chargedAt,
            periodEnd: end,
            lines: [line, ...addons.lines],
            // The GSTIN and state given at checkout are for that checkout's
            // own first charge; a renewal is billed to the business as it
            // is now (its billing profile), so a GSTIN corrected or a move of state
            // since reaches every later invoice (17 Oct 2026).
            billTo: checkout && firstOf ? billToOf(checkout) : null,
            issuedAt: now,
        });
        await this.markAddonsInvoiced(tx, addons.rowIds, id);
        return id;
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

    // ── Add-ons on a charge (U16) ───────────────────────────────────────

    /** The add-on rows a charge took, as invoice lines (`addon-charges.ts`). */
    private async addonLinesInTx(
        tx: Tx,
        input: {
            organizationId: string;
            provider: string;
            providerSubscriptionId: string;
            chargedAt: Date;
            cycle: "month" | "year";
        },
    ): Promise<{ lines: SarohLineInput[]; rowIds: string[] }> {
        const rows = await chargedAddonRowsInTx(tx, input);
        const sac = this.sellerNow().sac;
        return {
            lines: rows.map((r) => ({
                description: r.description,
                sac,
                quantity: r.quantity,
                unitPaise: r.unitPaise,
            })),
            rowIds: rows.map((r) => r.id),
        };
    }

    private async markAddonsInvoiced(
        tx: Tx,
        rowIds: string[],
        invoiceId: string | null,
    ): Promise<void> {
        if (!invoiceId || rowIds.length === 0) return;
        await tx.subscriptionAddonCharge.updateMany({
            where: { id: { in: rowIds }, status: "SENT" },
            data: { status: "INVOICED", invoiceId },
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
        if (existing) {
            await this.fillProviderIdsInTx(tx, existing.id, {
                providerPaymentId: charge.providerPaymentId,
                providerCustomerId: charge.providerCustomerId,
                providerAmountPaise: charge.providerAmountPaise,
            });
            return null;
        }
        // Who it is addressed to, as they are now: the billing profile
        // (DEC-167), read once here and copied, so an edit to the profile
        // reaches the next invoice and never an issued one.
        const buyer = await buyerInTx(
            tx,
            charge.organizationId,
            charge.checkoutId,
        );
        // The customer the provider billed: the charge's (its checkout's,
        // else the provider's word), else the profile's, else the
        // subscription's from before profiles.
        const providerCustomerId =
            charge.providerCustomerId ??
            buyer.providerCustomerId ??
            (
                await tx.subscription.findUnique({
                    where: { organizationId: charge.organizationId },
                    select: { providerCustomerId: true },
                })
            )?.providerCustomerId ??
            null;

        const seller = this.sellerNow();
        const gaps = sellerGaps(seller);
        if (gaps.length) {
            this.logger.warn(
                `saroh_invoice_seller_incomplete missing=${gaps.join(",")}`,
            );
        }

        // A checkout made on a billing profile saved what it was given to
        // the profile: the profile alone says who is billed. One made
        // before profiles keeps the state and GSTIN it was given.
        const given = buyer.fromProfile ? null : charge.billTo;
        const billToGstin = given?.gstin ?? buyer.gstin;
        const billToState =
            given?.state ?? (given?.gstin ? given.gstin.slice(0, 2) : null);
        const supply = sarohSupply({
            billToState,
            billToGstin,
            profileState: buyer.state,
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
                providerCustomerId,
                billingProfileId: buyer.billingProfileId,
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
                billToName: buyer.name,
                billToEmail: buyer.email,
                billToPhone: buyer.phone,
                // The address only: the paper adds the state from the
                // place of supply, so the two never disagree (Rule 46(e)).
                billToAddress: buyer.address,
                billToState:
                    stateCode(billToState) ??
                    stateCode(billToGstin?.slice(0, 2)) ??
                    stateCode(buyer.state) ??
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
        if (charge.providerPaymentId) {
            await keepProviderAmountInTx(
                tx,
                this.logger,
                {
                    id: invoice.id,
                    organizationId: charge.organizationId,
                    number: invoice.number,
                    provider: charge.provider,
                    providerPaymentId: charge.providerPaymentId,
                    totalPaise: totals.totalPaise,
                    providerAmountPaise: null,
                },
                charge.providerAmountPaise,
            );
        }
        await enqueueBillingEmail(tx, {
            kind: "INVOICE",
            organizationId: charge.organizationId,
            invoiceId: invoice.id,
        });
        if (charge.providerPaymentId) {
            await enqueuePaymentNotes(tx, {
                organizationId: charge.organizationId,
                invoiceId: invoice.id,
            });
        }
        this.logger.log(
            `saroh_invoice_written org=${charge.organizationId} number=${invoice.number} source=${charge.source}`,
        );
        return invoice.id;
    }

    /**
     * The provider's ids an invoice was written without, filled in by a
     * later event for the same charge (17 Oct 2026): the confirm path can
     * write it before the provider names the payment. Never overwritten;
     * the payment's notes are set once it is known.
     */
    private async fillProviderIdsInTx(
        tx: Tx,
        invoiceId: string,
        ids: {
            providerPaymentId?: string | null;
            providerCustomerId?: string | null;
            providerAmountPaise?: number | null;
        },
    ): Promise<void> {
        const invoice = await tx.sarohInvoice.findUniqueOrThrow({
            where: { id: invoiceId },
            select: {
                organizationId: true,
                number: true,
                provider: true,
                totalPaise: true,
                providerAmountPaise: true,
                providerPaymentId: true,
                providerCustomerId: true,
            },
        });
        // The amount only for the payment the invoice is for (DEC-166).
        const paidBy = invoice.providerPaymentId ?? ids.providerPaymentId;
        if (paidBy && paidBy === ids.providerPaymentId) {
            await keepProviderAmountInTx(
                tx,
                this.logger,
                { ...invoice, id: invoiceId, providerPaymentId: paidBy },
                ids.providerAmountPaise,
            );
        }
        const payment = !invoice.providerPaymentId
            ? (ids.providerPaymentId ?? null)
            : null;
        const customer = !invoice.providerCustomerId
            ? (ids.providerCustomerId ?? null)
            : null;
        if (!payment && !customer) return;
        await tx.sarohInvoice.update({
            where: { id: invoiceId },
            data: {
                ...(payment ? { providerPaymentId: payment } : {}),
                ...(customer ? { providerCustomerId: customer } : {}),
            },
        });
        if (payment) {
            await enqueuePaymentNotes(tx, {
                organizationId: invoice.organizationId,
                invoiceId,
            });
        }
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

/** Who a Saroh invoice is addressed to, as read at issue time. */
interface Buyer {
    /** The billing profile it is addressed to; null: none (before profiles). */
    billingProfileId: string | null;
    /** Read from a billing profile (else the business's own details). */
    fromProfile: boolean;
    name: string;
    email: string | null;
    phone: string | null;
    /** The address without its state (the paper adds it). */
    address: string | null;
    /** The address's GST state code. */
    state: string | null;
    gstin: string | null;
    /** The profile's customer at the provider. */
    providerCustomerId: string | null;
}

/**
 * Who Saroh's invoice is addressed to (DEC-167, R4): the billing profile
 * the charge's checkout was made on (a business switched to another
 * profile keeps the old one's for what that checkout paid), else the
 * business's now — its legal name (else the business's name), billing
 * email, phone, address, state and GSTIN. Never Settings › Business: that
 * is the business's own seller identity (owner, 18 Oct 2026).
 *
 * A business with no profile (left so by the data move) is billed as
 * before profiles, so its invoice is still written (DEC-068: after money,
 * nothing is refused): `buyerBeforeProfilesInTx`.
 */
async function buyerInTx(
    tx: Tx,
    organizationId: string,
    checkoutId: string | null | undefined,
): Promise<Buyer> {
    const [org, checkout] = await Promise.all([
        tx.organization.findUnique({
            where: { id: organizationId },
            select: { name: true, billingProfileId: true },
        }),
        checkoutId
            ? tx.billingCheckout.findUnique({
                  where: { id: checkoutId },
                  select: {
                      billingProfileId: true,
                      createdByUserId: true,
                      billToEmail: true,
                      billToPhone: true,
                  },
              })
            : null,
    ]);
    const select = {
        id: true,
        legalName: true,
        billingEmail: true,
        phone: true,
        gstin: true,
        gstState: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postalCode: true,
        providerCustomerId: true,
    } as const;
    let profile = null;
    for (const id of [checkout?.billingProfileId, org?.billingProfileId]) {
        if (!id) continue;
        profile = await tx.billingProfile.findUnique({
            where: { id },
            select,
        });
        if (profile) break;
    }
    if (!profile) {
        return buyerBeforeProfilesInTx(tx, organizationId, org?.name, checkout);
    }
    return {
        billingProfileId: profile.id,
        fromProfile: true,
        name: buyerName(profile.legalName, org?.name),
        email: nonEmpty(profile.billingEmail),
        phone: nonEmpty(profile.phone),
        address: formatSellerAddress({ ...profile, stateName: null }),
        state: profile.gstState,
        gstin: nonEmpty(profile.gstin),
        providerCustomerId: profile.providerCustomerId,
    };
}

/**
 * Who a business with no billing profile is billed to, as before profiles
 * (17 Oct 2026): its own legal name, registered address and state, its
 * GSTIN while GST-registered; the email of the owner who checked out, else
 * the business's contact email, else one given at checkout, else its first
 * owner's; its phone, else one given at checkout.
 */
async function buyerBeforeProfilesInTx(
    tx: Tx,
    organizationId: string,
    orgName: string | null | undefined,
    checkout: {
        createdByUserId: string | null;
        billToEmail: string | null;
        billToPhone: string | null;
    } | null,
): Promise<Buyer> {
    const [business, user] = await Promise.all([
        tx.businessProfile.findUnique({
            where: { organizationId },
            select: {
                legalName: true,
                contactEmail: true,
                phone: true,
                gstRegistered: true,
                taxId: true,
                gstState: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                postalCode: true,
            },
        }),
        checkout?.createdByUserId
            ? tx.user.findUnique({
                  where: { id: checkout.createdByUserId },
                  select: { email: true },
              })
            : null,
    ]);
    let email =
        nonEmpty(user?.email) ??
        nonEmpty(business?.contactEmail) ??
        nonEmpty(checkout?.billToEmail);
    if (!email) {
        const owner = await tx.membership.findFirst({
            where: { organizationId, role: "OWNER" },
            orderBy: { createdAt: "asc" },
            select: { user: { select: { email: true } } },
        });
        email = nonEmpty(owner?.user.email);
    }
    return {
        billingProfileId: null,
        fromProfile: false,
        name: buyerName(business?.legalName, orgName),
        email,
        phone: nonEmpty(business?.phone) ?? nonEmpty(checkout?.billToPhone),
        address: business
            ? formatSellerAddress({ ...business, stateName: null })
            : null,
        state: business?.gstState ?? null,
        gstin:
            business?.gstRegistered && business.taxId ? business.taxId : null,
        providerCustomerId: null,
    };
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
        description: `${seller.name} ${planName} Plan — ${cycle === "year" ? "Annual" : "Monthly"} SaaS Subscription`,
        sac: seller.sac,
        unitPaise: pricePaise,
    };
}

/** The customer a checkout's charge bills: Saroh's record, else the event's. */
function customerOf(
    checkout: BillingCheckout,
    event: ParsedBillingEvent,
): string | null {
    return checkout.providerCustomerId ?? event.providerCustomerId ?? null;
}
