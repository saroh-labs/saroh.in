import type { InactivitySignalKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import { paymentsHealth } from "../provider-health/provider-health.service";
import { OPERATOR_LIFECYCLE_ACTIONS } from "./admin-lifecycle.service";

/**
 * Inactivity signals (R13, #1199): signs a business has gone quiet, stored
 * once per kind in `InactivitySignal` so the attention list, the manager's
 * page and the daily email (U18) all read the same rows.
 *
 * {@link sweepInactivitySignals} opens a signal while its condition holds
 * and clears it once it doesn't; {@link unemailedSignals} is what the daily
 * email has not told a manager yet. Everything here reads across
 * businesses with no organization context, behind the admin console or a
 * job, like the directory.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A business younger than this is never flagged. */
export const NEW_BUSINESS_DAYS = 7;
/** No action by the business's own team for this long → NO_ACTIVITY. */
export const NO_ACTIVITY_DAYS = 7;
/** No booking or order for this long, with either switched on → NO_TRADING. */
export const NO_TRADING_DAYS = 14;

/**
 * Modules that make a business one that trades: bookings, selling and
 * classes. A course seat and a class-pack class are `Booking` rows, so the
 * booking read below already counts them.
 */
export const TRADING_MODULES = [
    "APPOINTMENTS",
    "COMMERCE",
    "COURSES",
    "CLASS_PACKS",
] as const;

/** Businesses read per page of the sweep. */
const SWEEP_PAGE = 500;

export type { InactivitySignalKind };

/** What the sweep knows about one business. */
export interface BusinessFacts {
    createdAt: Date;
    lifecycleStatus: string;
    /** Its team's latest recorded action (the directory's `lastActiveAt`). */
    lastActiveAt: Date | null;
    /** Bookings or selling switched on. */
    trades: boolean;
    /** Its latest booking or order. */
    lastTradeAt: Date | null;
    /** It had a payment provider and none is connected now. */
    paymentsDisconnected: boolean;
}

/**
 * The signals a business should have open now, each with when its quiet
 * began. Pure: the sweep reads the facts, this decides.
 */
export function signalsFor(
    facts: BusinessFacts,
    now: Date,
): Map<InactivitySignalKind, Date> {
    const open = new Map<InactivitySignalKind, Date>();
    // Suspended or leaving businesses have their own flags.
    if (facts.lifecycleStatus !== "ACTIVE") return open;
    if (now.getTime() - facts.createdAt.getTime() < NEW_BUSINESS_DAYS * DAY_MS)
        return open;

    const quietSince = (last: Date | null, days: number): Date | null => {
        const since = last ?? facts.createdAt;
        return now.getTime() - since.getTime() > days * DAY_MS ? since : null;
    };

    const inactive = quietSince(facts.lastActiveAt, NO_ACTIVITY_DAYS);
    if (inactive) open.set("NO_ACTIVITY", inactive);
    if (facts.trades) {
        const untraded = quietSince(facts.lastTradeAt, NO_TRADING_DAYS);
        if (untraded) open.set("NO_TRADING", untraded);
    }
    // When it came apart isn't recorded; when the sweep noticed is.
    if (facts.paymentsDisconnected) open.set("PAYMENT_DISCONNECTED", now);
    return open;
}

/**
 * Each business's own latest recorded action: what the business did, not
 * what an operator did to it. The directory's `lastActiveAt` and the
 * NO_ACTIVITY signal both read this, so they can't disagree.
 */
export async function lastActiveByOrganization(
    ids: string[],
): Promise<Map<string, Date | null>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.auditEvent.groupBy({
        by: ["organizationId"],
        where: {
            organizationId: { in: ids },
            action: { notIn: [...OPERATOR_LIFECYCLE_ACTIONS] },
        },
        _max: { createdAt: true },
    });
    return new Map(rows.map((row) => [row.organizationId, row._max.createdAt]));
}

/** An open signal: what, and since when. */
export interface OpenSignal {
    kind: InactivitySignalKind;
    since: Date;
}

/** Open signals for these businesses, oldest first, by business. */
export async function openSignalsByOrganization(
    ids: string[],
): Promise<Map<string, OpenSignal[]>> {
    const byOrg = new Map<string, OpenSignal[]>();
    if (ids.length === 0) return byOrg;
    const rows = await prisma.inactivitySignal.findMany({
        where: { organizationId: { in: ids }, clearedAt: null },
        select: { organizationId: true, kind: true, since: true },
        orderBy: { since: "asc" },
    });
    for (const row of rows) {
        byOrg.set(row.organizationId, [
            ...(byOrg.get(row.organizationId) ?? []),
            { kind: row.kind, since: row.since },
        ]);
    }
    return byOrg;
}

/** Read one page of businesses' facts in a handful of grouped queries. */
async function readFacts(ids: string[]): Promise<Map<string, BusinessFacts>> {
    const [orgs, lastActive, bookings, orders, providers] = await Promise.all([
        prisma.organization.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                createdAt: true,
                lifecycleStatus: true,
                organizationModules: {
                    where: {
                        status: "ENABLED",
                        moduleKey: { in: [...TRADING_MODULES] },
                    },
                    select: { moduleKey: true },
                },
            },
        }),
        lastActiveByOrganization(ids),
        prisma.booking.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: ids } },
            _max: { createdAt: true },
        }),
        prisma.order.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: ids } },
            _max: { createdAt: true },
        }),
        prisma.merchantPaymentProvider.findMany({
            where: { organizationId: { in: ids } },
            select: { organizationId: true, status: true, attentionAt: true },
        }),
    ]);

    const lastTrade = new Map<string, Date>();
    for (const row of [...bookings, ...orders]) {
        const at = row._max.createdAt;
        if (!row.organizationId || !at) continue;
        const seen = lastTrade.get(row.organizationId);
        if (!seen || at > seen) lastTrade.set(row.organizationId, at);
    }
    const payments = new Map<string, typeof providers>();
    for (const row of providers) {
        payments.set(row.organizationId, [
            ...(payments.get(row.organizationId) ?? []),
            row,
        ]);
    }

    return new Map(
        orgs.map((org) => {
            const health = paymentsHealth(payments.get(org.id) ?? []).status;
            return [
                org.id,
                {
                    createdAt: org.createdAt,
                    lifecycleStatus: org.lifecycleStatus,
                    lastActiveAt: lastActive.get(org.id) ?? null,
                    trades: org.organizationModules.length > 0,
                    lastTradeAt: lastTrade.get(org.id) ?? null,
                    paymentsDisconnected:
                        health === "FAILED" || health === "DEGRADED",
                },
            ];
        }),
    );
}

/**
 * Open the signals whose condition holds and clear the ones whose doesn't,
 * for every business (or just `organizationIds`), a page at a time. Safe to
 * run twice at once: the one-open-per-kind index turns a second open into
 * nothing.
 */
export async function sweepInactivitySignals(
    options: { now?: Date; organizationIds?: string[] } = {},
): Promise<{ opened: number; cleared: number }> {
    const now = options.now ?? new Date();
    let opened = 0;
    let cleared = 0;
    let cursor: string | undefined;

    for (;;) {
        const page = await prisma.organization.findMany({
            where: options.organizationIds
                ? { id: { in: options.organizationIds } }
                : {},
            select: { id: true },
            orderBy: { id: "asc" },
            take: SWEEP_PAGE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (page.length === 0) break;
        const ids = page.map((row) => row.id);

        const [facts, open] = await Promise.all([
            readFacts(ids),
            prisma.inactivitySignal.findMany({
                where: { organizationId: { in: ids }, clearedAt: null },
                select: { id: true, organizationId: true, kind: true },
            }),
        ]);

        const wanted = new Map(
            ids.map((id) => {
                const business = facts.get(id);
                return [
                    id,
                    business
                        ? signalsFor(business, now)
                        : new Map<InactivitySignalKind, Date>(),
                ];
            }),
        );
        const toClear = open.filter(
            (row) => !wanted.get(row.organizationId)?.has(row.kind),
        );
        const isOpen = new Set(
            open.map((row) => `${row.organizationId}:${row.kind}`),
        );
        const toOpen = [...wanted].flatMap(([organizationId, kinds]) =>
            [...kinds]
                .filter(([kind]) => !isOpen.has(`${organizationId}:${kind}`))
                .map(([kind, since]) => ({ organizationId, kind, since })),
        );

        if (toClear.length > 0) {
            const result = await prisma.inactivitySignal.updateMany({
                where: {
                    id: { in: toClear.map((row) => row.id) },
                    clearedAt: null,
                },
                data: { clearedAt: now },
            });
            cleared += result.count;
        }
        if (toOpen.length > 0) {
            const result = await prisma.inactivitySignal.createMany({
                data: toOpen,
                skipDuplicates: true,
            });
            opened += result.count;
        }

        if (page.length < SWEEP_PAGE) break;
        cursor = page[page.length - 1].id;
    }

    return { opened, cleared };
}

/** Open signals no manager has been emailed about yet, oldest first (U18). */
export function unemailedSignals() {
    return prisma.inactivitySignal.findMany({
        where: { clearedAt: null, emailedAt: null },
        select: { id: true, organizationId: true, kind: true, since: true },
        orderBy: { createdAt: "asc" },
    });
}

/** Record that these signals were emailed, once each (U18). */
export async function markEmailed(ids: string[], now: Date): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await prisma.inactivitySignal.updateMany({
        where: { id: { in: ids }, emailedAt: null },
        data: { emailedAt: now },
    });
    return result.count;
}
