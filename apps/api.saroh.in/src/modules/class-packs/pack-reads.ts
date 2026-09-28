import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { fromMinor, toMinor, toMoneyString } from "../../common/money";
import { businessTimezone } from "../bookings/staff-availability";
import { contactName } from "../invoices/serialize";
import { actorView, teamNames } from "../subscriptions/event-actors";
import type { PackPaidBy } from "./pack-kind";

/**
 * Pack Detail's reads (round-2 E13, for E16): the list's and the
 * overview's figures, and who has it. Used this week and Sales (E17) are in
 * `pack-used-sales.ts`. Each needs only `pack:read`, which covers the whole
 * pack, prices and sales included (DEC-039): there is no money-free
 * projection and no `payment:read` or `invoice:read` check. The service
 * authorizes and finds the pack first.
 */

const DAY_MS = 86_400_000;
/** "Running out": a live pack ending within this many days (the design). */
export const RUNNING_OUT_DAYS = 14;
/** The most rows a read answers. */
export const LIST_LIMIT = 500;

export type PurchaseStanding = "ACTIVE" | "USED_UP" | "EXPIRED";

/** A purchase's standing: expired first, then used up, else live. */
export function standingOf(
    p: { expiresAt: Date; left: number },
    now: Date,
): PurchaseStanding {
    if (p.expiresAt <= now) return "EXPIRED";
    return p.left === 0 ? "USED_UP" : "ACTIVE";
}

/** Money summed per currency, as the wire carries it. */
export interface MoneyTotal {
    currency: string;
    amount: string;
}

function totals(
    rows: { price: { toString(): string }; currency: string }[],
): MoneyTotal[] {
    const by = new Map<string, number>();
    for (const r of rows) {
        by.set(r.currency, (by.get(r.currency) ?? 0) + toMinor(r.price));
    }
    return [...by.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, minor]) => ({
            currency,
            amount: fromMinor(minor),
        }));
}

// — Figures (the list's cards and the overview) ——————————————————————

/** What the Packs list's cards count, per pack. */
export interface PackCounts {
    /** Every time it has been sold, still live or not. */
    sold: number;
    /** Purchases that still have classes and time left. */
    active: number;
    /** Classes (or sessions) left across those. */
    creditsLeft: number;
    /** People holding a live purchase of it: one person with two counts once (E15). */
    people: number;
    /** What every sale was sold for, per currency (E15, the card's "taken"). */
    takings: MoneyTotal[];
}

/**
 * Per pack: times sold, live purchases, the classes left on them, the
 * people holding them, and what it has taken. A pack never sold is missing
 * from the map.
 */
export async function packCounts(
    organizationId: string,
    packIds: string[],
    now = new Date(),
): Promise<Map<string, PackCounts>> {
    const counts = new Map<string, PackCounts>();
    if (packIds.length === 0) return counts;
    const rows = await prisma.packPurchase.findMany({
        where: { organizationId, packId: { in: packIds } },
        select: {
            packId: true,
            contactId: true,
            credits: true,
            expiresAt: true,
            price: true,
            currency: true,
            _count: {
                select: { redemptions: { where: { reversedAt: null } } },
            },
        },
    });
    const byPack = new Map<string, typeof rows>();
    for (const r of rows) {
        const list = byPack.get(r.packId) ?? [];
        list.push(r);
        byPack.set(r.packId, list);
    }
    for (const [packId, sales] of byPack) {
        const people = new Set<string>();
        let active = 0;
        let creditsLeft = 0;
        for (const r of sales) {
            const left = Math.max(0, r.credits - r._count.redemptions);
            if (r.expiresAt > now && left > 0) {
                active += 1;
                creditsLeft += left;
                people.add(r.contactId);
            }
        }
        counts.set(packId, {
            sold: sales.length,
            active,
            creditsLeft,
            people: people.size,
            takings: totals(sales),
        });
    }
    return counts;
}

/** Pack Detail's Overview: the design's tiles, worked out on the server. */
export interface PackOverview {
    /** People with a live purchase: time and classes left. */
    holders: number;
    /** Classes (or sessions) left across live purchases. */
    creditsLeft: number;
    /** Live purchases ending within {@link RUNNING_OUT_DAYS} days. */
    runningOut: number;
    /** Classes never used on purchases that have expired. */
    lostToExpiry: number;
    /** Every sale. */
    sold: number;
    /** Sales this calendar month, in the business's time zone. */
    soldThisMonth: number;
    /** What every sale was sold for, per currency. */
    takings: MoneyTotal[];
    /** What this month's sales were sold for, per currency. */
    takingsThisMonth: MoneyTotal[];
}

export async function packOverview(
    organizationId: string,
    packId: string,
    now = new Date(),
): Promise<PackOverview> {
    const [rows, zone] = await Promise.all([
        prisma.packPurchase.findMany({
            where: { organizationId, packId },
            select: {
                contactId: true,
                credits: true,
                expiresAt: true,
                price: true,
                currency: true,
                createdAt: true,
                _count: {
                    select: { redemptions: { where: { reversedAt: null } } },
                },
            },
        }),
        businessTimezone(prisma, organizationId),
    ]);
    const monthStart = DateTime.fromJSDate(now, { zone })
        .startOf("month")
        .toJSDate();
    const soon = new Date(now.getTime() + RUNNING_OUT_DAYS * DAY_MS);
    const holders = new Set<string>();
    let creditsLeft = 0;
    let runningOut = 0;
    let lostToExpiry = 0;
    const thisMonth: typeof rows = [];
    for (const r of rows) {
        const left = Math.max(0, r.credits - r._count.redemptions);
        if (r.expiresAt <= now) {
            lostToExpiry += left;
        } else if (left > 0) {
            holders.add(r.contactId);
            creditsLeft += left;
            if (r.expiresAt <= soon) runningOut += 1;
        }
        if (r.createdAt >= monthStart) thisMonth.push(r);
    }
    return {
        holders: holders.size,
        creditsLeft,
        runningOut,
        lostToExpiry,
        sold: rows.length,
        soldThisMonth: thisMonth.length,
        takings: totals(rows),
        takingsThisMonth: totals(thisMonth),
    };
}

// — Who has it ————————————————————————————————————————————————————

export interface PackExtensionView {
    id: string;
    days: number;
    reason: string;
    expiresBefore: string;
    expiresAfter: string;
    /** Who gave it: a teammate by name, or Saroh support. */
    by: { userId: string | null; name: string | null };
    createdAt: string;
}

export interface PackHolderView {
    purchaseId: string;
    contact: { id: string; name: string };
    credits: number;
    used: number;
    left: number;
    standing: PurchaseStanding;
    expiresAt: string;
    /** When it was sold. */
    soldAt: string;
    /** What it was sold for, which may be an older price. */
    price: string;
    currency: string;
    /** How it was paid; null when not recorded (sold before E13). */
    paidBy: PackPaidBy | null;
    /** Days added by extensions, in total. */
    extendedDays: number;
    /** Oldest first. */
    extensions: PackExtensionView[];
}

/**
 * Everyone who has bought the pack: live purchases first, soonest to end
 * first, then used-up and expired ones, most recently ended first. A person
 * with two purchases is two rows (each has its own use-by date).
 */
export async function packHolders(
    organizationId: string,
    which: { packId: string } | { purchaseId: string },
    now = new Date(),
): Promise<PackHolderView[]> {
    const rows = await prisma.packPurchase.findMany({
        where: {
            organizationId,
            ...("packId" in which
                ? { packId: which.packId }
                : { id: which.purchaseId }),
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
        select: {
            id: true,
            credits: true,
            price: true,
            currency: true,
            expiresAt: true,
            createdAt: true,
            paidBy: true,
            contact: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                },
            },
            extensions: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    days: true,
                    reason: true,
                    expiresBefore: true,
                    expiresAfter: true,
                    byUserId: true,
                    createdAt: true,
                },
            },
            _count: {
                select: { redemptions: { where: { reversedAt: null } } },
            },
        },
    });
    const names = await teamNames(
        rows.flatMap((r) =>
            r.extensions.map((e) => ({
                actorKind: e.byUserId ? "TEAM" : "OPERATOR",
                actorUserId: e.byUserId,
            })),
        ),
    );
    const views = rows.map((r): PackHolderView => {
        const used = r._count.redemptions;
        const left = Math.max(0, r.credits - used);
        return {
            purchaseId: r.id,
            contact: { id: r.contact.id, name: contactName(r.contact) },
            credits: r.credits,
            used,
            left,
            standing: standingOf({ expiresAt: r.expiresAt, left }, now),
            expiresAt: r.expiresAt.toISOString(),
            soldAt: r.createdAt.toISOString(),
            price: toMoneyString(r.price),
            currency: r.currency,
            paidBy: (r.paidBy as PackPaidBy | null) ?? null,
            extendedDays: r.extensions.reduce((n, e) => n + e.days, 0),
            extensions: r.extensions.map((e) => {
                // A null author is a Saroh operator, never stored (DEC-035).
                const who = actorView(
                    e.byUserId ? "TEAM" : "OPERATOR",
                    e.byUserId,
                    names,
                );
                return {
                    id: e.id,
                    days: e.days,
                    reason: e.reason,
                    expiresBefore: e.expiresBefore.toISOString(),
                    expiresAfter: e.expiresAfter.toISOString(),
                    by: { userId: who.userId, name: who.name },
                    createdAt: e.createdAt.toISOString(),
                };
            }),
        };
    });
    const live = views.filter((v) => v.standing === "ACTIVE");
    const past = views
        .filter((v) => v.standing !== "ACTIVE")
        .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
    return [...live, ...past];
}
