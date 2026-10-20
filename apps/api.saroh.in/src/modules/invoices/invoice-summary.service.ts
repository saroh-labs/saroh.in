import { Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { toMinor } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { allows, authorize } from "../organizations/organization-policy";
import {
    isPastDue,
    leftToPayCents,
    LIVE_PAYMENT_WHERE,
    NOT_A_BOOKING_HOLD,
    OWED_VIEW_WHERE,
    WAITING_CHEQUE_WHERE,
} from "./invoice-state";
import { DEFAULT_TIMEZONE } from "./numbering";

type Db = typeof prisma;

/** An amount in one currency, in minor units, as every Home total. */
export interface SummaryTotal {
    currency: string;
    amountMinor: number;
}

/**
 * The list filter a figure stands for, as the list's query takes it, so
 * the app never builds one: `?view=owed`, `?paidFrom=2026-10-01`.
 */
export interface InvoiceSummaryFilter {
    view?: "owed" | "overdue" | "draft" | "cheques";
    /** A date in the business's zone, `2026-10-01`. */
    paidFrom?: string;
}

export interface InvoiceSummaryFigure {
    count: number;
    /**
     * Per currency, in minor units, sorted by currency. Absent for a
     * viewer without `payment:read` (DEC-098): the strip is counts only.
     */
    totals?: SummaryTotal[];
    filter: InvoiceSummaryFilter;
}

/**
 * The Invoices money strip (DEC-173, U4), business-wide: what is owed
 * (left to pay), what of it is overdue, what came in this month, the
 * drafts, and the cheques not in the bank yet.
 */
export interface InvoiceSummary {
    /** The zone the month is kept in. */
    zone: string;
    /** The 1st of this month in that zone, `2026-10-01`. */
    monthStart: string;
    /** Whether the figures carry amounts (`payment:read`). */
    money: boolean;
    /** Issued and not an order's own, at what is left to pay on each. */
    owed: InvoiceSummaryFigure;
    /** Of those, past their due date (`isPastDue`). */
    overdue: InvoiceSummaryFigure;
    /**
     * Money received from the 1st in the business's zone: payments that
     * count, part payments included, plus an order's paper paid this
     * month (the order is its ledger). `count` is the invoices it came in
     * on; each rupee is counted once.
     */
    paidThisMonth: InvoiceSummaryFigure;
    drafts: InvoiceSummaryFigure;
    /** Null while no cheque is waiting: the line is shown only then. */
    chequesWaiting: InvoiceSummaryFigure | null;
}

/** Cheques received and not in the bank yet, business-wide. */
export interface ChequesWaitingTotals {
    /** How many cheques (not invoices). */
    count: number;
    totals: SummaryTotal[];
}

function add(by: Map<string, number>, currency: string, minor: number) {
    by.set(currency, (by.get(currency) ?? 0) + minor);
}

function sorted(by: Map<string, number>): SummaryTotal[] {
    return [...by.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/**
 * Cheques not in the bank (DEC-173), counted and summed per currency from
 * the ledger: waiting, not removed. A cleared or bounced cheque is not
 * waiting. Read by the summary and by Home's `week.chequesWaiting`
 * (`home/home-cheques.ts`), so the two never disagree.
 */
export async function readChequesWaiting(
    db: Db,
    organizationId: string,
): Promise<ChequesWaitingTotals> {
    const rows = await db.invoicePayment.groupBy({
        by: ["currency"],
        where: { organizationId, ...WAITING_CHEQUE_WHERE },
        _sum: { amountCents: true },
        _count: { _all: true },
        orderBy: { currency: "asc" },
    });
    const by = new Map<string, number>();
    let count = 0;
    for (const row of rows) {
        add(by, row.currency, row._sum.amountCents ?? 0);
        count += row._count._all;
    }
    return { count, totals: sorted(by) };
}

/** The zone a business keeps its days in, India's when it set none. */
export async function invoiceZoneOf(
    db: Db,
    organizationId: string,
): Promise<string> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: { timezone: true },
    });
    // "" included, as older rows stored it.
    const zone = profile?.timezone?.trim() ?? "";
    return zone.length > 0 ? zone : DEFAULT_TIMEZONE;
}

/** Midnight at the start of `date` (`2026-10-01`) in `zone`. */
export function startOfDayIn(date: string, zone: string): Date {
    return DateTime.fromISO(date, { zone }).startOf("day").toJSDate();
}

/** The 1st of `now`'s month in `zone`, as an instant and as a date. */
export function monthStartIn(
    now: Date,
    zone: string,
): { from: Date; date: string } {
    const first = DateTime.fromJSDate(now, { zone }).startOf("month");
    return { from: first.toJSDate(), date: first.toISODate() ?? "" };
}

/**
 * The money strip's one read (DEC-173, U4): `GET invoices/summary`.
 * `invoice:read` reads it; amounts need `payment:read` too (DEC-098),
 * else every figure is a count.
 */
@Injectable()
export class InvoiceSummaryService {
    async summary(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<InvoiceSummary> {
        authorize(ctx, "invoice:read");
        const money = allows(ctx, "payment:read");
        const organizationId = ctx.organizationId;
        const zone = await invoiceZoneOf(prisma, organizationId);
        const month = monthStartIn(now, zone);

        const [owedBills, drafts, paidIn, orderPaper, cheques] =
            await Promise.all([
                prisma.invoice.findMany({
                    where: { organizationId, ...OWED_VIEW_WHERE },
                    select: {
                        currency: true,
                        total: true,
                        paidCents: true,
                        status: true,
                        dueAt: true,
                    },
                }),
                prisma.invoice.groupBy({
                    by: ["currency"],
                    where: {
                        organizationId,
                        status: "DRAFT",
                        ...NOT_A_BOOKING_HOLD,
                    },
                    _sum: { total: true },
                    _count: { _all: true },
                    orderBy: { currency: "asc" },
                }),
                // Payments that count, received this month, on any paper
                // but a credit note; an order's paper has none.
                prisma.invoicePayment.findMany({
                    where: {
                        organizationId,
                        ...paymentsFrom(month.from),
                    },
                    select: {
                        invoiceId: true,
                        currency: true,
                        amountCents: true,
                    },
                }),
                prisma.invoice.findMany({
                    where: {
                        organizationId,
                        orderId: { not: null },
                        kind: { not: "CREDIT_NOTE" },
                        paidAt: { gte: month.from },
                    },
                    select: { id: true, currency: true, total: true },
                }),
                readChequesWaiting(prisma, organizationId),
            ]);

        const owed = new Map<string, number>();
        const overdue = new Map<string, number>();
        let overdueCount = 0;
        for (const bill of owedBills) {
            // What is left to pay on it (DEC-173), the one place it is
            // worked out.
            const left = leftToPayCents(bill);
            add(owed, bill.currency, left);
            if (isPastDue(bill, now)) {
                add(overdue, bill.currency, left);
                overdueCount += 1;
            }
        }

        const paid = new Map<string, number>();
        const paidOn = new Set<string>();
        for (const p of paidIn) {
            add(paid, p.currency, p.amountCents);
            paidOn.add(p.invoiceId);
        }
        for (const inv of orderPaper) {
            add(paid, inv.currency, toMinor(inv.total));
            paidOn.add(inv.id);
        }

        const draftTotals = new Map<string, number>();
        let draftCount = 0;
        for (const row of drafts) {
            add(draftTotals, row.currency, toMinor(row._sum.total ?? 0));
            draftCount += row._count._all;
        }

        const figure = (
            count: number,
            totals: Map<string, number> | SummaryTotal[],
            filter: InvoiceSummaryFilter,
        ): InvoiceSummaryFigure => ({
            count,
            ...(money
                ? {
                      totals: Array.isArray(totals) ? totals : sorted(totals),
                  }
                : {}),
            filter,
        });

        return {
            zone,
            monthStart: month.date,
            money,
            owed: figure(owedBills.length, owed, { view: "owed" }),
            overdue: figure(overdueCount, overdue, { view: "overdue" }),
            paidThisMonth: figure(paidOn.size, paid, {
                paidFrom: month.date,
            }),
            drafts: figure(draftCount, draftTotals, { view: "draft" }),
            chequesWaiting:
                cheques.count > 0
                    ? figure(cheques.count, cheques.totals, {
                          view: "cheques",
                      })
                    : null,
        };
    }
}

/**
 * Payments that count, received from `from` on, not on a credit note: the
 * ledger side of the list's `paidFrom` (`paidFromWhere`).
 */
function paymentsFrom(from: Date): Prisma.InvoicePaymentWhereInput {
    return {
        ...LIVE_PAYMENT_WHERE,
        receivedAt: { gte: from },
        invoice: { kind: { not: "CREDIT_NOTE" } },
    };
}
