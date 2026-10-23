import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import {
    BILLING_EMAIL_NOTICE_KIND,
    BILLING_EMAIL_TYPE,
} from "../billing/billing-email.job";
import { BILLING_NOTE_AUTHOR } from "../billing/billing-ops-notice";
import {
    REFUND_AUDIT_ACTION,
    REFUNDED_AUDIT_ACTION,
} from "../billing/double-charge";
import { renderSarohInvoicePdf } from "../billing/saroh-invoice-paper";
import type {
    InvoiceStatus,
    NextChargeHow,
    SubscriptionStatusKey,
    SubscriptionView,
} from "./admin-billing";
import {
    INVOICE_STATUSES,
    invoicesCsv,
    invoicesCsvFileName,
    istMonthRange,
    mrrPaise,
    nextChargeOf,
    subscriptionViewWhere,
} from "./admin-billing";
import type { BillingHistoryPage, HistoryShow } from "./admin-billing-history";
import {
    auditRow,
    emailJobRow,
    emailKindOf,
    HISTORY_MAX_PAGE,
    HISTORY_PAGE_SIZE,
    invoiceEmailedRow,
    invoiceIssuedRow,
    mergeHistory,
    noticeRow,
    providerEventRow,
    SHOW_KINDS,
} from "./admin-billing-history";
import { subscriptionTerms } from "./admin-billing-terms";
import { AdminPermission } from "./admin-permissions";

export const BILLING_PAGE_SIZE = 50;
/** The most a month's export holds; far above a month's invoices today. */
export const CSV_MAX_ROWS = 20_000;

export interface InvoiceQuery {
    /** "2026-10": issued in that month, India time. */
    month?: string;
    /** A business's name or address, an invoice number or the buyer's name. */
    q?: string;
    /** "yes": only invoices with a buyer GSTIN; "no": only without. */
    gstin?: "yes" | "no";
    /** Paid, unpaid (Razorpay took less) or refunded (R29). */
    status?: InvoiceStatus;
    page?: number;
}

export interface AdminInvoiceRow {
    id: string;
    number: string;
    issuedAt: string;
    organization: { id: string; name: string; slug: string };
    /** NEW | UPGRADE | SCHEDULED | RENEWAL: what was charged. */
    source: string;
    planName: string;
    cycle: string;
    currency: string;
    taxType: string;
    placeOfSupply: string | null;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    taxPaise: number;
    totalPaise: number;
    billToName: string;
    billToGstin: string | null;
    provider: string;
    providerPaymentId: string | null;
    /** The provider's subscription (or a yearly plan's order), DEC-166. */
    providerSubscriptionId: string | null;
    providerCustomerId: string | null;
    /** What the provider says it took; null: it hasn't said. */
    providerAmountPaise: number | null;
    /** The provider took another amount than the invoice's total. */
    amountMismatch: boolean;
    /** Refunds and disputes recorded on it (DEC-166). */
    refunds: AdminRefundRow[];
}

/** A refund or dispute on a Saroh payment (DEC-166). */
export interface AdminRefundRow {
    id: string;
    kind: string;
    provider: string;
    providerRefundId: string;
    providerPaymentId: string;
    invoiceId: string | null;
    amountPaise: number | null;
    status: string;
    reason: string | null;
    source: string;
    createdAt: string;
}

export interface InvoiceTotals {
    count: number;
    taxablePaise: number;
    taxPaise: number;
    totalPaise: number;
}

export interface AdminInvoicePage {
    items: AdminInvoiceRow[];
    page: number;
    limit: number;
    totals: InvoiceTotals;
    /**
     * How many invoices each status holds under the other filters (month,
     * search, GSTIN), for the status chips (R29).
     */
    statusCounts: Record<InvoiceStatus, number>;
}

export interface SubscriptionQuery {
    /** A business's name or slug, or a provider id (sub_, cust_, order_). */
    q?: string;
    status?: SubscriptionStatusKey;
    /** A plan's catalogue key ("catalog.grow"), any version or cycle. */
    plan?: string;
    view?: SubscriptionView;
    page?: number;
}

interface PlanBrief {
    key: string;
    name: string;
    version: number;
    interval: string;
}

export interface AdminSubscriptionRow {
    id: string;
    organization: { id: string; name: string; slug: string };
    plan: PlanBrief;
    status: string;
    billingCycle: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    /** When the owner chose to end it at the period's end. */
    freeChosenAt: string | null;
    pending: { plan: PlanBrief; from: string | null } | null;
    provider: string | null;
    providerSubscriptionId: string | null;
    providerCustomerId: string | null;
    /** When the autopay (or the year paid once) runs out, if known. */
    termEndsAt: string | null;
    termPayment: "AUTOPAY" | "ONE_TIME" | null;
    /**
     * When the autopay takes its next charge: the end of the period it is
     * in. Null when nothing more is taken (see `nextChargeHow`).
     */
    nextChargeAt: string | null;
    /** On autopay, paid for the year at once, or not charged again. */
    nextChargeHow: NextChargeHow;
    /** The autopay's approved charges run out within 30 days. */
    autopayRunsOutSoon: boolean;
    /**
     * Who the business is billed to (DEC-167): the profile's legal name and
     * how many businesses it bills. Null: no profile chosen yet.
     */
    billingProfile: { name: string; businesses: number } | null;
    lastInvoice: {
        id: string;
        number: string;
        issuedAt: string;
        totalPaise: number;
    } | null;
}

export interface SubscriptionSummary {
    byStatus: { status: string; count: number }[];
    byPlan: { key: string; name: string; count: number }[];
    /** Before GST, at each plan row's price; ACTIVE and PAST_DUE only. */
    mrrPaise: number;
    /** Ending, or moving to another plan, in the next 30 days. */
    endingSoon: number;
    currency: string;
}

/** How many rows each Billing tab holds (R25). */
export interface BillingCounts {
    subscriptions: number;
    invoices: number;
    /** Needs action rows still open. */
    openActions: number;
    events: number;
}

export interface AdminSubscriptionPage {
    items: AdminSubscriptionRow[];
    page: number;
    limit: number;
    total: number;
    summary: SubscriptionSummary;
    /** Every plan with a subscription, for the filter. */
    plans: { key: string; name: string }[];
}

export interface AdminSubscriptionDetail {
    subscription: AdminSubscriptionRow;
    /** When the business first got a subscription. */
    since: string;
    /**
     * The plan's list price, before GST, for its cycle; and a custom
     * monthly price staff gave the business (an offer), with its end.
     */
    price: {
        listPaise: number;
        currency: string;
        customPaise: number | null;
        customUntil: string | null;
    };
    /**
     * Who Saroh bills the business to (DEC-167): its billing profile, the
     * profile's customer at the provider and its sync, and the other
     * businesses billed to the same profile. Null for a business that
     * hasn't chosen one yet.
     */
    billingProfile: {
        id: string;
        legalName: string;
        billingEmail: string;
        gstin: string | null;
        provider: string;
        providerCustomerId: string | null;
        syncedAt: string | null;
        lastError: string | null;
        contactWithheld: boolean;
        /** The other businesses on the profile, by name. */
        otherBusinesses: { id: string; name: string }[];
    } | null;
    /** Its last invoices, with their refunds (DEC-166). */
    invoices: AdminInvoiceRow[];
    /** Refunds and disputes on its payments, invoiced or not. */
    refunds: AdminRefundRow[];
    /** Its open Needs-action rows (DEC-166), oldest first. */
    openActions: {
        id: string;
        code: string;
        note: string;
        refs: Record<string, string>;
        createdAt: string;
    }[];
    /** Double charges Saroh owes or has refunded (DEC-164). */
    doubleCharges: {
        providerPaymentId: string;
        provider: string;
        amountPaise: number | null;
        reason: string | null;
        claimedAt: string;
        refundedAt: string | null;
        providerRefundId: string | null;
    }[];
    checkouts: {
        id: string;
        kind: string;
        status: string;
        cycle: string;
        planName: string;
        pricePaise: number;
        chargeNowPaise: number;
        provider: string;
        providerSubscriptionId: string;
        startAt: string | null;
        expiresAt: string;
        completedAt: string | null;
        endedReason: string | null;
        billToGstin: string | null;
        createdAt: string;
    }[];
    /** The provider's billing events for this business, newest first. */
    events: {
        id: string;
        provider: string;
        providerEventId: string;
        type: string;
        receivedAt: string;
        processedAt: string | null;
    }[];
}

const ORG_BRIEF = { select: { id: true, name: true, slug: true } } as const;
const PLAN_BRIEF = {
    select: { key: true, name: true, version: true, interval: true },
} as const;

/**
 * Saroh's own billing across every business (DEC-179) — a CROSS-TENANT
 * READ. Every invoice Saroh issued, its PDF and the month's GST export, and
 * every business's Saroh subscription with its checkouts and the provider's
 * events, read with no Organization context, so the `org_isolation`
 * policies take their permissive branch.
 *
 * Only behind `@AdminRoutes()` and `saroh-billing:read` (Platform Owners and
 * Billing), and every method checks the permission again itself
 * ({@link assertSarohBillingReader}), so a route that ever lost its
 * decorator still refuses. A tenant path never calls this service; the
 * business's own `GET …/billing/invoices` stays scoped to its own
 * Organization (`SarohInvoicesService.list`).
 *
 * It returns Saroh's documents and the business's billing details on them
 * (buyer name, GSTIN, state) — never the business's customers, orders or
 * a provider event's payload.
 */
@Injectable()
export class AdminBillingService {
    // ── Invoices ───────────────────────────────────────────────────────

    async listInvoices(
        staff: PlatformAdminInfo,
        query: InvoiceQuery,
    ): Promise<AdminInvoicePage> {
        assertSarohBillingReader(staff);
        const refunded = await refundedInvoiceIds();
        const where = invoiceWhere(query, refunded);
        const others = invoiceWhere({ ...query, status: undefined });
        const page = Math.max(1, query.page ?? 1);
        const [rows, sums, ...byStatus] = await Promise.all([
            prisma.sarohInvoice.findMany({
                where,
                orderBy: [{ issuedAt: "desc" }, { number: "desc" }],
                skip: (page - 1) * BILLING_PAGE_SIZE,
                take: BILLING_PAGE_SIZE,
                include: { organization: ORG_BRIEF },
            }),
            prisma.sarohInvoice.aggregate({
                where,
                _count: { _all: true },
                _sum: { taxablePaise: true, taxPaise: true, totalPaise: true },
            }),
            ...INVOICE_STATUSES.map((status) =>
                prisma.sarohInvoice.count({
                    where: {
                        AND: [others, invoiceStatusWhere(status, refunded)],
                    },
                }),
            ),
        ]);
        const refunds = await refundsByInvoice(rows.map((r) => r.id));
        return {
            items: rows.map((r) => ({
                id: r.id,
                number: r.number,
                issuedAt: r.issuedAt.toISOString(),
                organization: r.organization,
                source: r.source,
                planName: r.planName,
                cycle: r.cycle,
                currency: r.currency,
                taxType: r.taxType,
                placeOfSupply: r.placeOfSupply,
                taxablePaise: r.taxablePaise,
                cgstPaise: r.cgstPaise,
                sgstPaise: r.sgstPaise,
                igstPaise: r.igstPaise,
                taxPaise: r.taxPaise,
                totalPaise: r.totalPaise,
                billToName: r.billToName,
                billToGstin: r.billToGstin,
                provider: r.provider,
                providerPaymentId: r.providerPaymentId,
                ...providerColumns(r),
                refunds: refunds.get(r.id) ?? [],
            })),
            page,
            limit: BILLING_PAGE_SIZE,
            totals: {
                count: sums._count._all,
                taxablePaise: sums._sum.taxablePaise ?? 0,
                taxPaise: sums._sum.taxPaise ?? 0,
                totalPaise: sums._sum.totalPaise ?? 0,
            },
            statusCounts: Object.fromEntries(
                INVOICE_STATUSES.map((status, i) => [status, byStatus[i]]),
            ) as Record<InvoiceStatus, number>,
        };
    }

    /**
     * One month's invoices as a CSV for GST filing, in number order. The
     * month is required: an export of everything ever is not a filing.
     * The other filters apply too, so "with GSTIN" exports the B2B rows
     * and "Refunded" the month's refunded ones (R29).
     */
    async exportInvoices(
        staff: PlatformAdminInfo,
        query: InvoiceQuery,
    ): Promise<{ csv: string; fileName: string; count: number }> {
        assertSarohBillingReader(staff);
        if (!query.month || !istMonthRange(query.month)) {
            throw new BadRequestException("Choose a month to export.");
        }
        const refunded = query.status ? await refundedInvoiceIds() : [];
        const rows = await prisma.sarohInvoice.findMany({
            where: invoiceWhere(query, refunded),
            orderBy: [{ issuedAt: "asc" }, { number: "asc" }],
            take: CSV_MAX_ROWS,
            include: {
                lines: { select: { sac: true }, orderBy: { position: "asc" } },
            },
        });
        return {
            csv: invoicesCsv(rows),
            fileName: invoicesCsvFileName(query.month),
            count: rows.length,
        };
    }

    /** One invoice's PDF, drawn by the same renderer the business gets. */
    async invoicePdf(
        staff: PlatformAdminInfo,
        invoiceId: string,
    ): Promise<{ file: Buffer; fileName: string; organizationId: string }> {
        assertSarohBillingReader(staff);
        const invoice = await prisma.sarohInvoice.findUnique({
            where: { id: invoiceId },
            include: { lines: true },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
        const pdf = await renderSarohInvoicePdf(invoice);
        return { ...pdf, organizationId: invoice.organizationId };
    }

    // ── The tabs' counts ───────────────────────────────────────────────

    /**
     * What each Billing tab holds, for its tab (R25): every subscription,
     * every invoice, the open Needs-action rows and every provider event.
     * Counts only, nothing about a business.
     */
    async counts(staff: PlatformAdminInfo): Promise<BillingCounts> {
        assertSarohBillingReader(staff);
        const [subscriptions, invoices, openActions, events] =
            await Promise.all([
                prisma.subscription.count(),
                prisma.sarohInvoice.count(),
                prisma.billingAction.count({ where: { resolvedAt: null } }),
                prisma.billingWebhookEvent.count(),
            ]);
        return { subscriptions, invoices, openActions, events };
    }

    // ── Subscriptions ──────────────────────────────────────────────────

    async listSubscriptions(
        staff: PlatformAdminInfo,
        query: SubscriptionQuery,
        now: Date = new Date(),
    ): Promise<AdminSubscriptionPage> {
        assertSarohBillingReader(staff);
        const where: Prisma.SubscriptionWhereInput = {
            AND: [
                subscriptionViewWhere(query.view, now),
                query.status ? { status: query.status } : {},
                query.plan ? { plan: { key: query.plan } } : {},
                subscriptionSearch(query.q),
            ],
        };
        const page = Math.max(1, query.page ?? 1);
        const [rows, total, summary, plans] = await Promise.all([
            prisma.subscription.findMany({
                where,
                orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
                skip: (page - 1) * BILLING_PAGE_SIZE,
                take: BILLING_PAGE_SIZE,
                include: SUBSCRIPTION_INCLUDE,
            }),
            prisma.subscription.count({ where }),
            this.summary(now),
            prisma.plan.findMany({
                where: { subscriptions: { some: {} } },
                distinct: ["key"],
                orderBy: [{ key: "asc" }, { version: "desc" }],
                select: { key: true, name: true },
            }),
        ]);
        return {
            items: await this.rows(rows, now),
            page,
            limit: BILLING_PAGE_SIZE,
            total,
            summary,
            plans,
        };
    }

    /** One subscription with its checkouts and the provider's events. */
    async subscriptionDetail(
        staff: PlatformAdminInfo,
        subscriptionId: string,
        now: Date = new Date(),
    ): Promise<AdminSubscriptionDetail> {
        assertSarohBillingReader(staff);
        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: SUBSCRIPTION_INCLUDE,
        });
        if (!sub) throw new NotFoundException("Subscription not found");
        const [rows, checkouts, events, extra] = await Promise.all([
            this.rows([sub], now),
            prisma.billingCheckout.findMany({
                where: { organizationId: sub.organizationId },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 25,
                include: { plan: { select: { name: true } } },
            }),
            prisma.billingWebhookEvent.findMany({
                where: { organizationId: sub.organizationId },
                orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
                take: 50,
                // Never the payload: it is the provider's whole message.
                select: {
                    id: true,
                    provider: true,
                    providerEventId: true,
                    type: true,
                    receivedAt: true,
                    processedAt: true,
                },
            }),
            this.detailExtra(sub.organizationId, now),
        ]);
        return {
            subscription: rows[0],
            since: sub.createdAt.toISOString(),
            price: {
                listPaise: sub.plan.priceCents,
                currency: sub.plan.currency,
                customPaise: extra.customPrice?.value ?? null,
                customUntil:
                    extra.customPrice?.expiresAt?.toISOString() ?? null,
            },
            ...extra.shown,
            checkouts: checkouts.map((c) => ({
                id: c.id,
                kind: c.kind,
                status: c.status,
                cycle: c.cycle,
                planName: c.plan.name,
                pricePaise: c.pricePaise,
                chargeNowPaise: c.chargeNowPaise,
                provider: c.provider,
                providerSubscriptionId: c.providerSubscriptionId,
                startAt: c.startAt?.toISOString() ?? null,
                expiresAt: c.expiresAt.toISOString(),
                completedAt: c.completedAt?.toISOString() ?? null,
                endedReason: c.endedReason,
                billToGstin: c.billToGstin,
                createdAt: c.createdAt.toISOString(),
            })),
            events: events.map((e) => ({
                ...e,
                receivedAt: e.receivedAt.toISOString(),
                processedAt: e.processedAt?.toISOString() ?? null,
            })),
        };
    }

    /**
     * One subscription's history (admin plan U15, R27): one timeline,
     * newest first, merged from the five places it is kept: what the
     * billing provider sent (`BillingWebhookEvent`: its type and ids,
     * **never its payload**, which is not even selected), the invoices
     * Saroh issued and emailed (`SarohInvoice`), the billing emails sent
     * (`CustomerNotice` of kind `SAROH_BILLING_EMAIL`) or still waiting or
     * failed (`Job` of type `billing.email`, its payload's `kind` only),
     * and every write staff or Saroh made to the business
     * (`AdminAuditEvent` rows with an idempotency key; reads, this one
     * included, carry none and stay out).
     *
     * Paged by number: each source reads its newest `page × limit + 1`
     * rows and the merge cuts the page, so no row is skipped or repeated
     * across pages.
     */
    async history(
        staff: PlatformAdminInfo,
        subscriptionId: string,
        query: { show?: HistoryShow; page?: number } = {},
    ): Promise<BillingHistoryPage & { organizationId: string }> {
        assertSarohBillingReader(staff);
        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: { organizationId: true },
        });
        if (!sub) throw new NotFoundException("Subscription not found");
        const organizationId = sub.organizationId;
        const show = query.show ?? "everything";
        const kinds = new Set(SHOW_KINDS[show]);
        const page = Math.min(HISTORY_MAX_PAGE, Math.max(1, query.page ?? 1));
        const limit = HISTORY_PAGE_SIZE;
        const take = page * limit + 1;
        const none = Promise.resolve([] as never[]);

        const [events, invoices, emailed, notices, jobs, audits] =
            await Promise.all([
                kinds.has("provider")
                    ? prisma.billingWebhookEvent.findMany({
                          where: { organizationId },
                          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
                          take,
                          // Never the payload: the provider's whole message.
                          select: {
                              id: true,
                              provider: true,
                              providerEventId: true,
                              type: true,
                              receivedAt: true,
                              processedAt: true,
                          },
                      })
                    : none,
                kinds.has("invoice")
                    ? prisma.sarohInvoice.findMany({
                          where: { organizationId },
                          orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
                          take,
                          select: INVOICE_FOR_HISTORY,
                      })
                    : none,
                kinds.has("email")
                    ? prisma.sarohInvoice.findMany({
                          where: { organizationId, emailedAt: { not: null } },
                          orderBy: [{ emailedAt: "desc" }, { id: "desc" }],
                          take,
                          select: INVOICE_FOR_HISTORY,
                      })
                    : none,
                kinds.has("email")
                    ? prisma.customerNotice.findMany({
                          where: {
                              organizationId,
                              kind: BILLING_EMAIL_NOTICE_KIND,
                          },
                          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                          take,
                          select: { id: true, eventKey: true, createdAt: true },
                      })
                    : none,
                kinds.has("email")
                    ? prisma.job.findMany({
                          where: {
                              organizationId,
                              type: BILLING_EMAIL_TYPE,
                              // A sent one is its notice or its invoice.
                              status: { not: "DONE" },
                          },
                          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                          take,
                          select: {
                              id: true,
                              status: true,
                              attempts: true,
                              maxAttempts: true,
                              createdAt: true,
                              payload: true,
                          },
                      })
                    : none,
                kinds.has("staff")
                    ? prisma.adminAuditEvent.findMany({
                          where: {
                              organizationId,
                              // Writes only: a read carries no key.
                              idempotencyKey: { not: null },
                          },
                          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                          take,
                          select: {
                              id: true,
                              action: true,
                              actorUserId: true,
                              reason: true,
                              outcome: true,
                              targetId: true,
                              createdAt: true,
                          },
                      })
                    : none,
            ]);

        const names = await actorNames(audits.map((a) => a.actorUserId));
        const merged = mergeHistory(
            [
                events.map(providerEventRow),
                invoices.map(invoiceIssuedRow),
                emailed.map(invoiceEmailedRow),
                notices.map(noticeRow),
                jobs.map((j) =>
                    emailJobRow({ ...j, emailKind: emailKindOf(j.payload) }),
                ),
                audits.map((a) =>
                    auditRow(a, names.get(a.actorUserId) ?? "Staff"),
                ),
            ],
            page,
            limit,
        );
        return { ...merged, page, limit, show, organizationId };
    }

    /**
     * What the sheet shows beyond the subscription (DEC-166): the billing
     * profile with its provider customer and sync (DEC-167), the last 12 invoices with their refunds,
     * every refund and dispute, and the double charges owed or refunded.
     */
    private async detailExtra(organizationId: string, now: Date) {
        const [org, invoices, refunds, claims, actions, customPrice] =
            await Promise.all([
                prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: {
                        billingProfile: {
                            include: {
                                organizations: {
                                    where: { id: { not: organizationId } },
                                    orderBy: [{ name: "asc" }, { id: "asc" }],
                                    take: 50,
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                }),
                prisma.sarohInvoice.findMany({
                    where: { organizationId },
                    orderBy: [{ issuedAt: "desc" }, { number: "desc" }],
                    take: 12,
                    include: { organization: ORG_BRIEF },
                }),
                prisma.billingRefund.findMany({
                    where: { organizationId },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    take: 50,
                }),
                prisma.adminAuditEvent.findMany({
                    where: {
                        organizationId,
                        action: {
                            in: [REFUND_AUDIT_ACTION, REFUNDED_AUDIT_ACTION],
                        },
                    },
                    orderBy: { createdAt: "asc" },
                    take: 100,
                    select: {
                        action: true,
                        targetId: true,
                        reason: true,
                        metadata: true,
                        createdAt: true,
                    },
                }),
                prisma.billingAction.findMany({
                    where: { organizationId, resolvedAt: null },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: 25,
                }),
                // A custom price staff gave it, still standing (an offer).
                prisma.entitlementOverride.findFirst({
                    where: {
                        organizationId,
                        kind: "price",
                        revokedAt: null,
                        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                    },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    select: { value: true, expiresAt: true },
                }),
            ]);
        const refundRows = refunds.map(refundRow);
        const byInvoice = new Map<string, AdminRefundRow[]>();
        for (const r of refundRows) {
            if (!r.invoiceId) continue;
            byInvoice.set(r.invoiceId, [
                ...(byInvoice.get(r.invoiceId) ?? []),
                r,
            ]);
        }
        const shown = {
            billingProfile: profileOf(org?.billingProfile ?? null),
            invoices: invoices.map((r) =>
                invoiceRow(r, byInvoice.get(r.id) ?? []),
            ),
            refunds: refundRows,
            doubleCharges: doubleChargesOf(claims),
            openActions: actions.map((a) => ({
                id: a.id,
                code: a.code,
                note: a.note,
                refs: stringRefs(a.refs),
                createdAt: a.createdAt.toISOString(),
            })),
        };
        return { shown, customPrice };
    }

    /** Counts by status and plan, and the list-price monthly figure. */
    private async summary(now: Date): Promise<SubscriptionSummary> {
        const [groups, endingSoon] = await Promise.all([
            prisma.subscription.groupBy({
                by: ["planId", "status"],
                _count: { _all: true },
            }),
            prisma.subscription.count({
                where: subscriptionViewWhere("ending-soon", now),
            }),
        ]);
        const plans = await prisma.plan.findMany({
            where: { id: { in: [...new Set(groups.map((g) => g.planId))] } },
            select: {
                id: true,
                key: true,
                name: true,
                priceCents: true,
                interval: true,
                currency: true,
            },
        });
        const planById = new Map(plans.map((p) => [p.id, p]));
        const byStatus = new Map<string, number>();
        const byPlan = new Map<
            string,
            { key: string; name: string; count: number }
        >();
        const priced: Parameters<typeof mrrPaise>[0] = [];
        for (const g of groups) {
            const count = g._count._all;
            byStatus.set(g.status, (byStatus.get(g.status) ?? 0) + count);
            const plan = planById.get(g.planId);
            if (!plan) continue;
            priced.push({ status: g.status, count, plan });
            if (g.status === "CANCELLED") continue;
            const entry = byPlan.get(plan.key) ?? {
                key: plan.key,
                name: plan.name,
                count: 0,
            };
            entry.count += count;
            byPlan.set(plan.key, entry);
        }
        return {
            byStatus: [...byStatus].map(([status, count]) => ({
                status,
                count,
            })),
            byPlan: [...byPlan.values()].sort((a, b) => b.count - a.count),
            mrrPaise: mrrPaise(priced),
            endingSoon,
            currency: plans[0]?.currency ?? "INR",
        };
    }

    /** Rows with their autopay's end and last invoice, read in batches. */
    private async rows(
        subs: SubscriptionRecord[],
        now: Date,
    ): Promise<AdminSubscriptionRow[]> {
        const orgIds = subs.map((s) => s.organizationId);
        const [terms, invoices] = await Promise.all([
            subscriptionTerms(prisma, subs, now),
            prisma.sarohInvoice.findMany({
                where: { organizationId: { in: orgIds } },
                distinct: ["organizationId"],
                orderBy: [{ organizationId: "asc" }, { issuedAt: "desc" }],
                select: {
                    id: true,
                    organizationId: true,
                    number: true,
                    issuedAt: true,
                    totalPaise: true,
                },
            }),
        ]);
        const lastBy = new Map(invoices.map((i) => [i.organizationId, i]));
        return subs.map((s) => {
            const term = terms.get(s.id) ?? null;
            const last = lastBy.get(s.organizationId);
            const next = nextChargeOf(s, term, now);
            const profile = s.organization.billingProfile;
            return {
                id: s.id,
                organization: {
                    id: s.organization.id,
                    name: s.organization.name,
                    slug: s.organization.slug,
                },
                plan: s.plan,
                status: s.status,
                billingCycle: s.billingCycle,
                currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
                cancelAtPeriodEnd: s.cancelAtPeriodEnd,
                freeChosenAt: s.freeChosenAt?.toISOString() ?? null,
                pending: s.pendingPlan
                    ? {
                          plan: s.pendingPlan,
                          from: s.pendingFrom?.toISOString() ?? null,
                      }
                    : null,
                provider: s.provider,
                providerSubscriptionId: s.providerSubscriptionId,
                providerCustomerId: s.providerCustomerId,
                termEndsAt: term?.endsAt.toISOString() ?? null,
                termPayment: term?.payment ?? null,
                nextChargeAt: next.nextChargeAt?.toISOString() ?? null,
                nextChargeHow: next.nextChargeHow,
                autopayRunsOutSoon: next.autopayRunsOutSoon,
                billingProfile: profile
                    ? {
                          name: profile.legalName,
                          businesses: profile._count.organizations,
                      }
                    : null,
                lastInvoice: last
                    ? {
                          id: last.id,
                          number: last.number,
                          issuedAt: last.issuedAt.toISOString(),
                          totalPaise: last.totalPaise,
                      }
                    : null,
            };
        });
    }
}

const SUBSCRIPTION_INCLUDE = {
    organization: {
        select: {
            ...ORG_BRIEF.select,
            // Who it is billed to, and how many businesses that profile
            // bills (DEC-167): a count, never the other businesses' rows.
            billingProfile: {
                select: {
                    legalName: true,
                    _count: { select: { organizations: true } },
                },
            },
        },
    },
    plan: {
        select: { ...PLAN_BRIEF.select, priceCents: true, currency: true },
    },
    pendingPlan: PLAN_BRIEF,
} as const;

/** What an invoice's history rows read: no buyer's details. */
const INVOICE_FOR_HISTORY = {
    id: true,
    number: true,
    issuedAt: true,
    emailedAt: true,
    source: true,
    planName: true,
    totalPaise: true,
    currency: true,
    provider: true,
    providerPaymentId: true,
} as const;

/**
 * Who did each staff action: the staff's name (or email), "Saroh" for
 * what Saroh did itself (the billing provider's notes, the sweeps).
 */
async function actorNames(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const people = [...new Set(ids)];
    if (people.length === 0) return out;
    const users = await prisma.user.findMany({
        where: { id: { in: people } },
        select: { id: true, name: true, email: true },
    });
    for (const u of users) {
        const name = u.name?.trim() ?? "";
        out.set(u.id, name === "" ? u.email : name);
    }
    for (const id of people) {
        if (!out.has(id)) out.set(id, "Saroh");
    }
    out.set(BILLING_NOTE_AUTHOR, "Saroh");
    return out;
}

type SubscriptionRecord = Prisma.SubscriptionGetPayload<{
    include: typeof SUBSCRIPTION_INCLUDE;
}>;

/**
 * The permission, checked again inside the service (owner, 17 Oct): the
 * route's `@RequireAdminPermission` is the first lock, this the second.
 */
export function assertSarohBillingReader(staff: PlatformAdminInfo | undefined) {
    if (!staff?.permissions.includes(AdminPermission.SarohBillingRead)) {
        throw new ForbiddenException(
            "Platform administrator permission required",
        );
    }
}

/**
 * The invoices `where` for a query: month, search, GSTIN and, given the
 * refunded invoices' ids ({@link refundedInvoiceIds}), the status.
 */
export function invoiceWhere(
    query: InvoiceQuery,
    refunded: readonly string[] = [],
): Prisma.SarohInvoiceWhereInput {
    const and: Prisma.SarohInvoiceWhereInput[] = [];
    if (query.status) and.push(invoiceStatusWhere(query.status, refunded));
    const range = istMonthRange(query.month);
    if (range) and.push({ issuedAt: { gte: range.from, lt: range.to } });
    if (query.gstin === "yes") and.push({ billToGstin: { not: null } });
    if (query.gstin === "no") and.push({ billToGstin: null });
    const q = query.q?.trim();
    if (q && PROVIDER_ID.test(q)) {
        // A provider's id (DEC-166): exact, on the columns that carry it.
        and.push({
            OR: [
                { providerPaymentId: q },
                { providerSubscriptionId: q },
                { providerCustomerId: q },
                { providerEventId: q },
            ],
        });
    } else if (q) {
        and.push({
            OR: [
                { number: { contains: q, mode: "insensitive" } },
                { billToName: { contains: q, mode: "insensitive" } },
                {
                    organization: {
                        name: { contains: q, mode: "insensitive" },
                    },
                },
                {
                    organization: {
                        slug: { contains: q, mode: "insensitive" },
                    },
                },
            ],
        });
    }
    return { AND: and };
}

/**
 * Money given back on a Saroh invoice: a refund the provider processed, or
 * a dispute the business lost. A pending or failed refund, and a dispute
 * still open or won, leave the invoice as it was.
 */
const MONEY_BACK: Prisma.BillingRefundWhereInput = {
    invoiceId: { not: null },
    OR: [
        { kind: "REFUND", status: "PROCESSED" },
        { kind: "DISPUTE", status: "LOST" },
    ],
};

/** The ids of every invoice with money given back on it. */
async function refundedInvoiceIds(): Promise<string[]> {
    const rows = await prisma.billingRefund.findMany({
        where: MONEY_BACK,
        select: { invoiceId: true },
        distinct: ["invoiceId"],
    });
    return rows.flatMap((r) => (r.invoiceId ? [r.invoiceId] : []));
}

/**
 * One invoice status (R29) as a `where`. Refunded: money given back on it.
 * Unpaid: Razorpay says it took less than the invoice's total. Paid: the
 * rest; an invoice is written when a charge is taken, so one the provider
 * hasn't confirmed an amount for yet reads as paid.
 */
export function invoiceStatusWhere(
    status: InvoiceStatus,
    refunded: readonly string[],
): Prisma.SarohInvoiceWhereInput {
    if (status === "refunded") return { id: { in: [...refunded] } };
    const notRefunded = { id: { notIn: [...refunded] } };
    const total = prisma.sarohInvoice.fields.totalPaise;
    if (status === "unpaid") {
        return {
            AND: [notRefunded, { providerAmountPaise: { lt: total } }],
        };
    }
    // Not `NOT short`: a NULL amount would make it NULL, and drop the row.
    return {
        AND: [
            notRefunded,
            {
                OR: [
                    { providerAmountPaise: null },
                    { providerAmountPaise: { gte: total } },
                ],
            },
        ],
    };
}

function profileOf(
    p:
        | (Prisma.BillingProfileGetPayload<object> & {
              organizations: { id: string; name: string }[];
          })
        | null,
): AdminSubscriptionDetail["billingProfile"] {
    if (!p) return null;
    return {
        id: p.id,
        legalName: p.legalName,
        billingEmail: p.billingEmail,
        gstin: p.gstin,
        provider: p.provider,
        providerCustomerId: p.providerCustomerId,
        syncedAt: p.syncedAt?.toISOString() ?? null,
        lastError: p.lastError,
        contactWithheld: p.contactWithheld,
        otherBusinesses: p.organizations,
    };
}

/** A billing provider's id: Razorpay's pay_, sub_, cust_, order_, rfnd_. */
export const PROVIDER_ID =
    /^(pay|sub|cust|order|rfnd|inv|disp)_[A-Za-z0-9]{4,40}$/;

/**
 * The subscriptions search (DEC-166): a provider id finds the subscription
 * that carries it, or the business whose checkout or invoice does; a
 * customer id also finds every business billed to the billing profile that
 * holds it (DEC-167); anything else is a business's name or slug.
 */
export function subscriptionSearch(
    raw: string | undefined,
): Prisma.SubscriptionWhereInput {
    const q = raw?.trim();
    if (!q) return {};
    if (PROVIDER_ID.test(q)) {
        return {
            OR: [
                { providerSubscriptionId: q },
                { providerCustomerId: q },
                {
                    organization: {
                        billingCheckouts: {
                            some: {
                                OR: [
                                    { providerSubscriptionId: q },
                                    { providerCustomerId: q },
                                ],
                            },
                        },
                    },
                },
                // The profile's customer: every business billed to it.
                {
                    organization: {
                        billingProfile: { providerCustomerId: q },
                    },
                },
                {
                    organization: {
                        sarohInvoices: { some: { providerPaymentId: q } },
                    },
                },
            ],
        };
    }
    return {
        OR: [
            { organization: { name: { contains: q, mode: "insensitive" } } },
            { organization: { slug: { contains: q, mode: "insensitive" } } },
        ],
    };
}

type RefundRecord = Prisma.BillingRefundGetPayload<object>;

function refundRow(r: RefundRecord): AdminRefundRow {
    return {
        id: r.id,
        kind: r.kind,
        provider: r.provider,
        providerRefundId: r.providerRefundId,
        providerPaymentId: r.providerPaymentId,
        invoiceId: r.invoiceId,
        amountPaise: r.amountPaise,
        status: r.status,
        reason: r.reason,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
    };
}

/** The refunds and disputes on a page of invoices, by invoice. */
async function refundsByInvoice(
    invoiceIds: string[],
): Promise<Map<string, AdminRefundRow[]>> {
    const out = new Map<string, AdminRefundRow[]>();
    if (invoiceIds.length === 0) return out;
    const rows = await prisma.billingRefund.findMany({
        where: { invoiceId: { in: invoiceIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const r of rows) {
        if (!r.invoiceId) continue;
        out.set(r.invoiceId, [...(out.get(r.invoiceId) ?? []), refundRow(r)]);
    }
    return out;
}

/** The provider's columns of an invoice row (DEC-166). */
function providerColumns(r: {
    providerSubscriptionId: string | null;
    providerCustomerId: string | null;
    providerAmountPaise: number | null;
    totalPaise: number;
}) {
    return {
        providerSubscriptionId: r.providerSubscriptionId,
        providerCustomerId: r.providerCustomerId,
        providerAmountPaise: r.providerAmountPaise,
        amountMismatch:
            r.providerAmountPaise !== null &&
            r.providerAmountPaise !== r.totalPaise,
    };
}

function invoiceRow(
    r: Prisma.SarohInvoiceGetPayload<{
        include: { organization: typeof ORG_BRIEF };
    }>,
    refunds: AdminRefundRow[],
): AdminInvoiceRow {
    return {
        id: r.id,
        number: r.number,
        issuedAt: r.issuedAt.toISOString(),
        organization: r.organization,
        source: r.source,
        planName: r.planName,
        cycle: r.cycle,
        currency: r.currency,
        taxType: r.taxType,
        placeOfSupply: r.placeOfSupply,
        taxablePaise: r.taxablePaise,
        cgstPaise: r.cgstPaise,
        sgstPaise: r.sgstPaise,
        igstPaise: r.igstPaise,
        taxPaise: r.taxPaise,
        totalPaise: r.totalPaise,
        billToName: r.billToName,
        billToGstin: r.billToGstin,
        provider: r.provider,
        providerPaymentId: r.providerPaymentId,
        ...providerColumns(r),
        refunds,
    };
}

/** Double charges from their claim and refunded rows (DEC-164). */
function doubleChargesOf(
    rows: {
        action: string;
        targetId: string | null;
        reason: string | null;
        metadata: Prisma.JsonValue;
        createdAt: Date;
    }[],
): AdminSubscriptionDetail["doubleCharges"] {
    const byPayment = new Map<
        string,
        AdminSubscriptionDetail["doubleCharges"][number]
    >();
    for (const row of rows) {
        if (!row.targetId) continue;
        const meta = (
            row.metadata &&
            typeof row.metadata === "object" &&
            !Array.isArray(row.metadata)
                ? row.metadata
                : {}
        ) as Record<string, unknown>;
        const entry = byPayment.get(row.targetId) ?? {
            providerPaymentId: row.targetId,
            provider: typeof meta.provider === "string" ? meta.provider : "",
            amountPaise: null,
            reason: null,
            claimedAt: row.createdAt.toISOString(),
            refundedAt: null,
            providerRefundId: null,
        };
        if (typeof meta.amountPaise === "number") {
            entry.amountPaise = meta.amountPaise;
        }
        if (row.action === REFUND_AUDIT_ACTION) {
            entry.reason = row.reason;
            entry.claimedAt = row.createdAt.toISOString();
        } else {
            entry.refundedAt = row.createdAt.toISOString();
            entry.providerRefundId =
                typeof meta.providerRefundId === "string"
                    ? meta.providerRefundId
                    : null;
        }
        byPayment.set(row.targetId, entry);
    }
    return [...byPayment.values()].reverse();
}

function stringRefs(value: Prisma.JsonValue): Record<string, string> {
    const out: Record<string, string> = {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
            if (typeof v === "string") out[k] = v;
        }
    }
    return out;
}
