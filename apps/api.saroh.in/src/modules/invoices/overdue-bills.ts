import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { INVOICE_TEMPLATES } from "../communications/transactional";
import { CAPTURED_NEEDS_REFUND, OWED_WHERE } from "./invoice-state";

/**
 * The overdue bills: one definition, read by Home's bills group
 * (`home-money-sources.ts`, "10 overdue") and by Remind all (Home plan U8:
 * the ids Home hands `POST invoices/reminders`), so the count on Home and
 * the people Remind all lists never disagree.
 *
 * An overdue bill is an issued invoice past its due date that is neither an
 * order's own (the order is the ledger for its money, ADR-008) nor a credit
 * note, nor a live subscription's latest period invoice (the failed-renewal
 * row on Home speaks for that one). A booking's pay link paid after the
 * booking was cancelled is owed back, not chased (K-1).
 */

type Db = Prisma.TransactionClient;

/** A subscription still running: anything but cancelled. */
export const LIVE_SUBSCRIPTION = {
    status: { not: "CANCELLED" },
} satisfies Prisma.CustomerSubscriptionWhereInput;

/**
 * Each subscription's latest period invoice — the last ISSUED or PAID one
 * by issue date, the rule Subscription Detail's failed charge uses — as
 * subscription id → invoice id. The failed-renewal row speaks for that one
 * invoice; any other unpaid invoice of a live subscription is listed as an
 * overdue invoice instead.
 */
export async function latestPeriodInvoices(
    db: Db,
    organizationId: string,
    subscriptionIds: readonly string[],
): Promise<Map<string | null, string>> {
    const ids = Array.from(new Set(subscriptionIds));
    if (ids.length === 0) return new Map();
    const latest = await db.invoice.findMany({
        where: {
            organizationId,
            subscriptionId: { in: ids },
            status: { in: ["ISSUED", "PAID"] },
        },
        orderBy: [
            { issuedAt: { sort: "desc", nulls: "last" } },
            { id: "desc" },
        ],
        distinct: ["subscriptionId"],
        select: { id: true, subscriptionId: true },
    });
    return new Map(latest.map((l) => [l.subscriptionId, l.id]));
}

/** The where that picks a business's overdue bills, as of `now`. */
export async function overdueBillsWhere(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<Prisma.InvoiceWhereInput> {
    const pastDue = {
        organizationId,
        ...OWED_WHERE,
        status: "ISSUED",
        dueAt: { lt: now },
        // A booking's pay link paid after the booking was cancelled leaves
        // its invoice issued, but the customer paid and is owed it back
        // (K-1): the refund row asks for that, and Home never asks to chase
        // them for it too.
        paymentIntents: {
            none: { attempts: { some: { status: CAPTURED_NEEDS_REFUND } } },
        },
    } satisfies Prisma.InvoiceWhereInput;

    // A live subscription's past-due invoices that are NOT its latest period
    // invoice: the failed-renewal row speaks only for the latest, so an
    // older one left unpaid after a later one was paid would otherwise show
    // nowhere (H-2). Listed here, as the money owed that it is.
    const live = await db.invoice.findMany({
        where: {
            ...pastDue,
            subscriptionId: { not: null },
            subscription: { is: LIVE_SUBSCRIPTION },
        },
        select: { id: true, subscriptionId: true },
    });
    const latestOf = await latestPeriodInvoices(
        db,
        organizationId,
        live.flatMap((i) => (i.subscriptionId ? [i.subscriptionId] : [])),
    );
    const olderOfLive = live
        .filter(
            (i) =>
                i.subscriptionId !== null &&
                latestOf.get(i.subscriptionId) !== i.id,
        )
        .map((i) => i.id);

    return {
        ...pastDue,
        // Spelled out rather than `NOT: { subscription: … }`: in SQL, NOT of
        // a match on a null subscriptionId is null, not true, and would drop
        // every invoice that has no subscription at all.
        OR: [
            { subscriptionId: null },
            { subscription: { is: { status: "CANCELLED" } } },
            ...(olderOfLive.length > 0 ? [{ id: { in: olderOfLive } }] : []),
        ],
    };
}

/** At most this many bills go into one Remind all, oldest due first. */
export const REMIND_ALL_MAX = 100;
/** Remind all waits anyone sent or reminded in the last 3 days (DEC-171). */
export const REMIND_ALL_QUIET_DAYS = 3;

/**
 * The overdue bills Home's Remind all hands `POST invoices/reminders`
 * (Home plan U8): the 100 oldest due, by the one definition above. The
 * reminders route reads each again, so this is what was meant, never a
 * promise.
 */
export async function overdueBillIds(
    db: Db,
    organizationId: string,
    now: Date,
    // The where a caller already worked out for the same `now` (Home's
    // build, review #16); else it is worked out here.
    overdueWhere?: Promise<Prisma.InvoiceWhereInput>,
): Promise<string[]> {
    const where = await (overdueWhere ??
        overdueBillsWhere(db, organizationId, now));
    const rows = await db.invoice.findMany({
        where,
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        take: REMIND_ALL_MAX,
        select: { id: true },
    });
    return rows.map((r) => r.id);
}

/** The last time a bill was sent or reminded, and which it was. */
export interface LastHeard {
    at: Date;
    /** A reminder; false for the first send. */
    reminder: boolean;
}

/** A send that went, or is going: a failed or suppressed one doesn't count. */
const WENT = ["QUEUED", "SENT"];

/** The WhatsApp shares that ask to be paid, as `nextReminderAt` counts them. */
const WHATSAPP_ASKS = ["NEW", "REMINDER"];

/**
 * When each of these bills was last sent or reminded, since `since`: by an
 * email that went, a post into the customer's account thread (A13), or a
 * WhatsApp share that asked to be paid (DEC-173), the three things one
 * reminder a day counts. Bills not heard of since then are absent. Home
 * says it on the bill's row ("reminded yesterday") and Remind many with
 * `quietDays` (Remind all, U8) waits a bill heard of in the last 3 days.
 */
export async function lastHeardFrom(
    db: Db,
    organizationId: string,
    invoiceIds: readonly string[],
    since: Date,
): Promise<Map<string, LastHeard>> {
    const out = new Map<string, LastHeard>();
    if (invoiceIds.length === 0) return out;
    const ids = Array.from(new Set(invoiceIds));
    const [emails, posts, shares] = await Promise.all([
        db.message.findMany({
            where: {
                organizationId,
                invoiceId: { in: ids },
                template: { in: [...INVOICE_TEMPLATES] },
                status: { in: WENT },
                createdAt: { gt: since },
            },
            orderBy: { createdAt: "desc" },
            distinct: ["invoiceId"],
            select: { invoiceId: true, createdAt: true, template: true },
        }),
        db.customerThreadMessage.findMany({
            where: {
                organizationId,
                invoiceId: { in: ids },
                event: { in: [...INVOICE_TEMPLATES] },
                createdAt: { gt: since },
            },
            orderBy: { createdAt: "desc" },
            distinct: ["invoiceId"],
            select: { invoiceId: true, createdAt: true, event: true },
        }),
        db.invoiceShare.findMany({
            where: {
                organizationId,
                invoiceId: { in: ids },
                channel: "WHATSAPP",
                kind: { in: WHATSAPP_ASKS },
                createdAt: { gt: since },
            },
            orderBy: { createdAt: "desc" },
            distinct: ["invoiceId"],
            select: { invoiceId: true, createdAt: true, kind: true },
        }),
    ]);
    const note = (id: string | null, at: Date, kind: string | null) => {
        if (!id) return;
        const was = out.get(id);
        if (was && was.at >= at) return;
        out.set(id, { at, reminder: kind === "INVOICE_REMINDER" });
    };
    for (const m of emails) note(m.invoiceId, m.createdAt, m.template);
    for (const p of posts) note(p.invoiceId, p.createdAt, p.event);
    for (const w of shares) {
        note(
            w.invoiceId,
            w.createdAt,
            w.kind === "REMINDER" ? "INVOICE_REMINDER" : "INVOICE_SENT",
        );
    }
    return out;
}

/** Whole calendar days from `at` to `now`, in the business's zone. */
export function daysAgo(at: Date, now: Date, zone: string): number {
    const day = (d: Date) => DateTime.fromJSDate(d, { zone }).startOf("day");
    return Math.max(0, Math.round(day(now).diff(day(at), "days").days));
}

/**
 * "Reminded yesterday", "Sent today", "Reminded 2 days ago": when a bill
 * was last sent or reminded, as Remind all's skipped list and Home's bill
 * row say it (boards `HARemindD`, `HPSheets`).
 */
export function heardWords(last: LastHeard, now: Date, zone: string): string {
    const verb = last.reminder ? "Reminded" : "Sent";
    const days = daysAgo(last.at, now, zone);
    if (days === 0) return `${verb} today`;
    if (days === 1) return `${verb} yesterday`;
    return `${verb} ${days} days ago`;
}
