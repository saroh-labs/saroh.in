import type { prisma, Prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import { isPastDue, OWED_WHERE } from "../invoices/invoice-state";
import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT, overdueTag, personName } from "./home-model";

/**
 * Home's money sources (round 2, F1): renewals that haven't been paid, and
 * invoices past their due date. Each is read on its own through
 * `HomeService.attempt()`, so one failing is named and the other still shows.
 *
 * The two never list the same invoice. A live subscription's period
 * invoices belong to the failed-renewal row — the subscription is where the
 * merchant retries it — so the overdue-invoice source leaves them out. A
 * cancelled subscription's unpaid invoice is still money owed, and is listed
 * as an invoice.
 */

type Db = typeof prisma;

/** What happened to a renewal's charge, from D9's subscription event log. */
export type RenewalEventKind = "RENEWAL_FAILED" | "MANDATE_LIMIT_LOW";

export interface RenewalSignal {
    subscriptionId: string;
    kind: RenewalEventKind;
    at: Date;
}

/**
 * Reads the RENEWAL_FAILED and MANDATE_LIMIT_LOW events of these
 * subscriptions. Only D13 (a mandate charge) writes them, so before autopay
 * there are none and no renewal reads "Payment failed". A parameter, so
 * the unit specs can hand in their own.
 */
export type RenewalSignalReader = (
    db: Db,
    organizationId: string,
    subscriptionIds: readonly string[],
) => Promise<RenewalSignal[]>;

const RENEWAL_EVENT_KINDS: RenewalEventKind[] = [
    "RENEWAL_FAILED",
    "MANDATE_LIMIT_LOW",
];

/**
 * The event read, from D9's subscription log. Only D13 writes these two
 * kinds, so until autopay this finds none. Every event of theirs is read:
 * `renewalTag` keeps the ones since the unpaid invoice was issued.
 */
export const readRenewalSignals: RenewalSignalReader = async (
    db,
    organizationId,
    subscriptionIds,
) => {
    if (subscriptionIds.length === 0) return [];
    const rows = await db.subscriptionEvent.findMany({
        where: {
            organizationId,
            subscriptionId: { in: [...subscriptionIds] },
            kind: { in: RENEWAL_EVENT_KINDS },
        },
        select: { subscriptionId: true, kind: true, createdAt: true },
    });
    return rows.map((r) => ({
        subscriptionId: r.subscriptionId,
        kind: r.kind as RenewalEventKind,
        at: r.createdAt,
    }));
};

const EVENT_TAGS: Record<RenewalEventKind, string> = {
    RENEWAL_FAILED: "Payment failed",
    MANDATE_LIMIT_LOW: "Autopay limit too low",
};

/** Not cancelled: ACTIVE or PAUSED, and still owed what it billed. */
const LIVE_SUBSCRIPTION = {
    status: { not: "CANCELLED" },
} satisfies Prisma.CustomerSubscriptionWhereInput;

/**
 * Each subscription's latest period invoice — the last ISSUED or PAID one
 * by issue date, the rule Subscription Detail's failed charge uses — as
 * subscription id → invoice id. The failed-renewal row speaks for that one
 * invoice; any other unpaid invoice of a live subscription is listed as an
 * overdue invoice instead.
 */
async function latestPeriodInvoices(
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

/**
 * Failed renewals — the one source for them (overview, "Failed renewals on
 * Home"). A live subscription whose latest period invoice is unpaid, and
 * either past due or carrying a RENEWAL_FAILED or MANDATE_LIMIT_LOW event
 * since that invoice was issued. "Latest" is the rule Subscription Detail's
 * failed charge uses: the last ISSUED or PAID invoice by issue date.
 *
 * One row per subscription, oldest due first. The amount is shown only to
 * someone who reads invoices (`showAmount`).
 */
export async function failedRenewals(
    db: Db,
    organizationId: string,
    now: Date,
    showAmount: boolean,
    readSignals: RenewalSignalReader = readRenewalSignals,
): Promise<HomeAction | null> {
    const unpaid = await db.invoice.findMany({
        where: {
            organizationId,
            status: "ISSUED",
            subscriptionId: { not: null },
            subscription: { is: LIVE_SUBSCRIPTION },
        },
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        select: {
            id: true,
            status: true,
            subscriptionId: true,
            total: true,
            currency: true,
            issuedAt: true,
            dueAt: true,
            subscription: {
                select: {
                    plan: { select: { name: true } },
                    contact: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });
    // The where asked for a subscription; this only tells TypeScript so.
    const owed = unpaid.flatMap((i) =>
        i.subscriptionId && i.subscription
            ? [
                  {
                      ...i,
                      subscriptionId: i.subscriptionId,
                      subscription: i.subscription,
                  },
              ]
            : [],
    );
    if (owed.length === 0) return null;

    const latestOf = await latestPeriodInvoices(
        db,
        organizationId,
        owed.map((i) => i.subscriptionId),
    );
    const current = owed.filter((i) => latestOf.get(i.subscriptionId) === i.id);
    if (current.length === 0) return null;

    const signals = await readSignals(
        db,
        organizationId,
        current.map((i) => i.subscriptionId),
    );

    const evidence: HomeEvidence[] = [];
    for (const inv of current) {
        const { subscriptionId } = inv;
        const tag = renewalTag(inv, subscriptionId, signals, now);
        if (!tag) continue;
        evidence.push({
            id: subscriptionId,
            title: inv.subscription.plan.name,
            subtitle: personName(inv.subscription.contact),
            at: inv.dueAt?.toISOString() ?? null,
            amountMinor: showAmount ? toMinor(inv.total) : null,
            currency: showAmount ? inv.currency : null,
            href: `/billing/subscriptions/${subscriptionId}`,
            tag,
            tone: "bad",
        });
    }
    const count = evidence.length;
    if (count === 0) return null;

    return {
        code: "PAYMENTS_FAILED_RENEWALS",
        title:
            count === 1
                ? "Collect a renewal that hasn't been paid"
                : `Collect ${count} renewals that haven't been paid`,
        href:
            count === 1
                ? evidence[0].href
                : "/billing/subscriptions?tab=failed",
        severity: "OVERDUE",
        moduleKey: "PAYMENTS",
        count,
        evidence: evidence.slice(0, EVIDENCE_LIMIT),
        tone: "bad",
    };
}

/**
 * What the renewal row says, or null when there is nothing to act on yet.
 * The latest event since the invoice was issued names what happened;
 * without one, a past-due invoice is "Late · N days" — before autopay no
 * payment was attempted, so nothing can say it failed.
 */
export function renewalTag(
    invoice: { status: string; issuedAt: Date | null; dueAt: Date | null },
    subscriptionId: string,
    signals: readonly RenewalSignal[],
    now: Date,
): string | null {
    const since = invoice.issuedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    let latest: RenewalSignal | null = null;
    for (const s of signals) {
        if (s.subscriptionId !== subscriptionId) continue;
        if (s.at.getTime() < since) continue;
        if (!latest || s.at > latest.at) latest = s;
    }
    if (latest) return EVENT_TAGS[latest.kind];
    if (isPastDue(invoice, now) && invoice.dueAt)
        return overdueTag(invoice.dueAt, now);
    return null;
}

/**
 * Invoices past their due date that are neither an order's own (the order
 * is the ledger for its money, ADR-008) nor a live subscription's (the
 * failed-renewal row carries those). A draft is never overdue: only an
 * issued invoice has a due date that counts. One row per invoice, oldest
 * due first.
 */
export async function overdueInvoices(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<HomeAction | null> {
    const pastDue = {
        organizationId,
        ...OWED_WHERE,
        status: "ISSUED",
        dueAt: { lt: now },
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

    const where = {
        ...pastDue,
        // Spelled out rather than `NOT: { subscription: … }`: in SQL, NOT of
        // a match on a null subscriptionId is null, not true, and would drop
        // every invoice that has no subscription at all.
        OR: [
            { subscriptionId: null },
            { subscription: { is: { status: "CANCELLED" } } },
            ...(olderOfLive.length > 0 ? [{ id: { in: olderOfLive } }] : []),
        ],
    } satisfies Prisma.InvoiceWhereInput;

    const [count, rows] = await Promise.all([
        db.invoice.count({ where }),
        db.invoice.findMany({
            where,
            orderBy: [{ dueAt: "asc" }, { id: "asc" }],
            take: EVIDENCE_LIMIT,
            select: {
                id: true,
                number: true,
                total: true,
                currency: true,
                dueAt: true,
                billToName: true,
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
                // What it was for, on Home's row: "INV-0012 · X-ray · …".
                lines: {
                    orderBy: { position: "asc" },
                    take: 1,
                    select: { description: true },
                },
            },
        }),
    ]);
    if (count === 0) return null;

    const evidence: HomeEvidence[] = rows.map((inv) => {
        const first =
            inv.lines.length > 0 ? inv.lines[0].description.trim() : "";
        return {
            id: inv.id,
            title: inv.number ?? "Invoice",
            subtitle: billedTo(inv),
            at: inv.dueAt?.toISOString() ?? null,
            amountMinor: toMinor(inv.total),
            currency: inv.currency,
            href: `/billing/invoices/${inv.id}`,
            // Always set: the where asked for a due date before now.
            tag: inv.dueAt ? overdueTag(inv.dueAt, now) : undefined,
            tone: "bad",
            ...(first ? { detail: first } : {}),
        };
    });

    return {
        code: "PAYMENTS_OVERDUE_INVOICES",
        title:
            count === 1
                ? "Chase an overdue invoice"
                : `Chase ${count} overdue invoices`,
        href:
            count === 1 && evidence[0]
                ? evidence[0].href
                : "/billing/invoices?view=overdue",
        severity: "OVERDUE",
        moduleKey: "PAYMENTS",
        count,
        evidence,
        tone: "bad",
    };
}

/** Who an invoice is to: its bill-to name, else its contact's name. */
function billedTo(inv: {
    billToName: string | null;
    contact: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null;
}): string | null {
    const name = inv.billToName?.trim();
    if (name) return name;
    return inv.contact ? personName(inv.contact) : null;
}
