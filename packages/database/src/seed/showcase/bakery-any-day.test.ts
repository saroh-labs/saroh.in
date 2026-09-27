import { describe, expect, it } from "vitest";

import type { PlanInput } from "./bakery";
import { planWorld, ryeShopperKey } from "./bakery";
import { PRODUCTS } from "./bakery-catalogue";
import { REVIEWS } from "./bakery-product-page";
import type { Bought } from "./bakery-product-page-write";
import { pickRyeReviewers } from "./bakery-product-page-write";
import { SHELVES } from "./bakery-stock";

/**
 * Rye's reviews come only from real buyers (#522), and the orders they come
 * from are planned relative to `now`. A seed that works today must work on
 * any day, at any hour: plan the whole world for many `now`s and run the
 * reviewer pick on it, as `writeRyeReviews` does on the written rows. Just
 * after midnight all of today's board shares one instant, so the stock log's
 * order and the payments' times are checked on the plan too.
 */

const DAY = 86_400_000;

const input = (now: Date): PlanInput => ({
    now,
    orgId: "org",
    stores: { H: "store-h", O: "store-o" },
    demoUserId: "owner",
    counterUserId: "nisha",
    productIds: PRODUCTS.map((_, i) => `product-${i}`),
    variantIds: PRODUCTS.map((p, i) =>
        (p.variants ?? []).map((_, v) => `product-${i}-variant-${v}`),
    ),
    shelfIds: new Map(SHELVES.map((s) => [s.key, `shelf-${s.key}`])),
    planIds: ["plan-0", "plan-1", "plan-2"],
    allergenId: { Sesame: "allergen-sesame" },
});

// The plan's rows are Prisma inputs: every id and date is set, but typed loose.
const str = (s: string | null | undefined): string => s ?? "";
const date = (d: Date | string | null | undefined): Date =>
    d instanceof Date ? d : new Date(d ?? Number.NaN);

/** The lines `writeRyeReviews`' query would read back, in its order. */
function reviewable(now: Date): { bought: Bought[]; a: PlanInput } {
    const a = input(now);
    const w = planWorld(a);
    const when = now.toISOString();

    // The stock log reads back by (createdAt, id) as one chain per shelf —
    // also just after midnight, when all of today shares one instant.
    const log = [...w.stock.entries].sort(
        (x, y) =>
            date(x.createdAt).getTime() - date(y.createdAt).getTime() ||
            (str(x.id) < str(y.id) ? -1 : 1),
    );
    const last = new Map<string, number>();
    for (const e of log) {
        expect(e.before, `${str(e.id)} at ${when}`).toBe(
            last.get(e.stockLevelId) ?? 0,
        );
        last.set(e.stockLevelId, e.after);
    }
    // Nothing is paid, issued or logged after now.
    const late = [
        ...w.stock.entries.map((e) => date(e.createdAt)),
        ...w.intents.map((i) => date(i.updatedAt)),
        ...w.attempts.map((x) => date(x.createdAt)),
        ...w.docs.flatMap((d) => [d.issuedAt, d.paidAt]),
    ].filter((d) => d && d.getTime() > now.getTime());
    expect(late, when).toEqual([]);
    const cutoff = now.getTime() - DAY;
    const orders = new Map(w.orders.map((o) => [str(o.id), o]));
    const customers = new Map(w.customers.map((c) => [str(c.id), c]));
    const bought = w.items.flatMap((i): Bought[] => {
        const o = orders.get(i.orderId);
        if (!o) throw new Error(`No order ${i.orderId}`);
        const doneAt = date(o.updatedAt);
        if (
            o.paymentStatus !== "PAID" ||
            (o.status !== "SHIPPED" && o.status !== "DELIVERED") ||
            doneAt.getTime() >= cutoff
        ) {
            return [];
        }
        const c = customers.get(o.customerId);
        if (!c) throw new Error(`No customer ${o.customerId}`);
        return [
            {
                itemId: str(i.id),
                orderId: i.orderId,
                productId: i.productId,
                variantId: i.variantId ?? null,
                storeId: o.storeId,
                customerId: str(c.id),
                email: c.email,
                firstName: str(c.firstName),
                lastName: str(c.lastName),
                doneAt,
            },
        ];
    });
    bought.sort(
        (x, y) =>
            y.doneAt.getTime() - x.doneAt.getTime() ||
            (x.itemId < y.itemId ? -1 : x.itemId > y.itemId ? 1 : 0),
    );
    return { bought, a };
}

function checkDay(now: Date) {
    const { bought, a } = reviewable(now);
    const picked = pickRyeReviewers(bought, {
        ...a,
        shopperKey: ryeShopperKey,
    });
    for (const [slug, specs] of Object.entries(REVIEWS)) {
        expect(
            picked.filter((r) => r.slug === slug),
            `${slug} on ${now.toISOString()}`,
        ).toHaveLength(specs.length);
    }
    const lines = picked.map((r) => r.line.itemId);
    expect(new Set(lines).size, now.toISOString()).toBe(lines.length);
}

/** An instant at a Kolkata wall-clock time (UTC+5:30). */
const ist = (date: string, hhmm: string) =>
    new Date(`${date}T${hhmm}:00+05:30`);

// The seed rounds `now` down to the half hour; these cover the early
// morning (today's board squeezed), the counter's day and late evening.
const TIMES = ["00:00", "05:30", "09:00", "12:30", "15:00", "18:30", "23:30"];

describe("Rye & Co. seeded on any day", () => {
    it("reviews have buyers and the stock log chains, 60 days running", () => {
        const start = ist("2026-09-01", "00:00").getTime();
        for (let d = 0; d < 60; d++) {
            const date = new Date(start + d * DAY + 5.5 * 3_600_000)
                .toISOString()
                .slice(0, 10);
            for (const t of TIMES) checkDay(ist(date, t));
        }
    });

    it("the same across month, year and leap-day boundaries", () => {
        const dates = [
            "2026-03-31",
            "2026-04-01",
            "2026-12-31",
            "2027-01-01",
            "2027-02-28",
            "2027-03-01",
            "2028-02-28",
            "2028-02-29",
            "2028-03-01",
            "2028-12-31",
            "2029-01-01",
        ];
        for (const date of dates) {
            for (const t of TIMES) checkDay(ist(date, t));
        }
    });
});
