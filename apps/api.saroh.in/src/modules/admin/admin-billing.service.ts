import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { renderSarohInvoicePdf } from "../billing/saroh-invoice-paper";
import type { SubscriptionStatusKey, SubscriptionView } from "./admin-billing";
import {
    invoicesCsv,
    invoicesCsvFileName,
    istMonthRange,
    mrrPaise,
    subscriptionViewWhere,
} from "./admin-billing";
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
}

export interface SubscriptionQuery {
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
    currency: string;
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
 * Saroh's own billing across every business (DEC-163) — a CROSS-TENANT
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
        const where = invoiceWhere(query);
        const page = Math.max(1, query.page ?? 1);
        const [rows, sums] = await Promise.all([
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
        ]);
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
            })),
            page,
            limit: BILLING_PAGE_SIZE,
            totals: {
                count: sums._count._all,
                taxablePaise: sums._sum.taxablePaise ?? 0,
                taxPaise: sums._sum.taxPaise ?? 0,
                totalPaise: sums._sum.totalPaise ?? 0,
            },
        };
    }

    /**
     * One month's invoices as a CSV for GST filing, in number order. The
     * month is required: an export of everything ever is not a filing.
     * The other filters apply too, so "with GSTIN" exports the B2B rows.
     */
    async exportInvoices(
        staff: PlatformAdminInfo,
        query: InvoiceQuery,
    ): Promise<{ csv: string; fileName: string; count: number }> {
        assertSarohBillingReader(staff);
        if (!query.month || !istMonthRange(query.month)) {
            throw new BadRequestException("Choose a month to export.");
        }
        const rows = await prisma.sarohInvoice.findMany({
            where: invoiceWhere(query),
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
            this.summary(),
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
        const [rows, checkouts, events] = await Promise.all([
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
        ]);
        return {
            subscription: rows[0],
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

    /** Counts by status and plan, and the list-price monthly figure. */
    private async summary(): Promise<SubscriptionSummary> {
        const groups = await prisma.subscription.groupBy({
            by: ["planId", "status"],
            _count: { _all: true },
        });
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
            return {
                id: s.id,
                organization: s.organization,
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
    organization: ORG_BRIEF,
    plan: { select: { ...PLAN_BRIEF.select, priceCents: true } },
    pendingPlan: PLAN_BRIEF,
} as const;

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

/** The invoices `where` for a query: month, search and GSTIN. */
export function invoiceWhere(
    query: InvoiceQuery,
): Prisma.SarohInvoiceWhereInput {
    const and: Prisma.SarohInvoiceWhereInput[] = [];
    const range = istMonthRange(query.month);
    if (range) and.push({ issuedAt: { gte: range.from, lt: range.to } });
    if (query.gstin === "yes") and.push({ billToGstin: { not: null } });
    if (query.gstin === "no") and.push({ billToGstin: null });
    const q = query.q?.trim();
    if (q) {
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
