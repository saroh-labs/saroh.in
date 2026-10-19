/**
 * Insights' suggestions (DEC-171, #1087) against a real Postgres, on Monday
 * 19 Oct 2026 in Mumbai: each rule fires and doesn't at its edges through
 * the real reads (a class 90% vs 87% full, 4 vs 3 sessions; a bill 22 vs
 * 21 and 20 days late, part paid, an order's own and a credit note; a
 * product down a third having sold 10 vs 9 before); Not now hides one for
 * that person only, comes back on day 8 and is undone at once; one
 * business's Not now never hides another's; a role without money gets
 * only the class rule; a business with no sale gets the first-sale
 * suggestion; and no rule → nothing. Runs in the integration project,
 * plain and under TEST_RLS=on.
 */
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import { SuggestionsService } from "./suggestions.service";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai. 4 weeks: 22 Sep – 19 Oct against
// 25 Aug – 21 Sep.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

const service = new SuggestionsService();
let n = 0;

async function person(name: string) {
    n += 1;
    return (
        await prisma.user.create({
            data: {
                email: `${name}.${n}.${tag}@example.com`.toLowerCase(),
                name,
            },
        })
    ).id;
}

function owner(organizationId: string, userId: string): OrganizationContext {
    return { organizationId, userId, role: "OWNER" };
}

/** A role given Insights and nothing about money (`IBMemberD`). */
function insightsOnly(
    organizationId: string,
    userId: string,
): OrganizationContext {
    return {
        organizationId,
        userId,
        role: "MEMBER",
        roleKey: "insights-only",
        actions: new Set<OrgAction>(["analytics:read"]),
    };
}

async function business(
    name: string,
    createdAt = new Date("2026-01-05T06:00:00.000Z"),
) {
    const org = await prisma.organization.create({
        data: {
            name,
            slug: `sugg-${name}-${tag}`.toLowerCase().replace(/\s+/g, "-"),
            createdAt,
        },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    n += 1;
    const store = await prisma.store.create({
        data: {
            name: `${name} shop`,
            slug: `sugg-shop-${n}-${tag}`,
            organizationId: org.id,
            settings: { create: { currency: "INR" } },
        },
    });
    return { id: org.id, storeId: store.id };
}

async function product(organizationId: string, name: string, extra = {}) {
    n += 1;
    return prisma.product.create({
        data: {
            organizationId,
            name,
            slug: `sugg-p-${n}-${tag}`,
            price: "50",
            ...extra,
        },
    });
}

/** A paid order of `quantity` of `productId`, paid at `paidAt`. */
async function sale(
    organizationId: string,
    storeId: string,
    productId: string,
    quantity: number,
    paidAt: Date,
) {
    n += 1;
    const total = (50 * quantity).toFixed(2);
    return prisma.order.create({
        data: {
            organizationId,
            storeId,
            orderId: `SG-${n}-${tag}`,
            subtotal: total,
            total,
            currency: "INR",
            paymentStatus: "PAID",
            paidAt,
            createdAt: paidAt,
            items: { create: [{ productId, quantity, price: "50" }] },
        },
    });
}

async function classOf(
    organizationId: string,
    name: string,
    capacity: number,
    extra = {},
) {
    return prisma.service.create({
        data: {
            organizationId,
            name,
            durationMinutes: 60,
            capacity,
            timezone: ZONE,
            ...extra,
        },
    });
}

/** `taken` confirmed places at one session starting `startAt`. */
async function session(
    organizationId: string,
    serviceId: string,
    startAt: Date,
    taken: number,
    status = "CONFIRMED",
) {
    for (let i = 0; i < taken; i += 1) {
        await prisma.booking.create({
            data: {
                organizationId,
                serviceId,
                startAt,
                endAt: new Date(startAt.getTime() + 60 * MIN),
                timezone: ZONE,
                status,
                bookerEmail: `guest.${i}@example.com`,
                snapshot: {},
            },
        });
    }
}

/** An issued bill due at the end of `dueDay` in Mumbai. */
async function billDue(
    organizationId: string,
    dueDay: string,
    over: Record<string, unknown> = {},
) {
    n += 1;
    return prisma.invoice.create({
        data: {
            organizationId,
            number: `SG-INV-${n}-${tag}`,
            status: "ISSUED",
            currency: "INR",
            subtotal: "2500.00",
            total: "2500.00",
            issuedAt: ist(`${dueDay}T09:00:00`),
            dueAt: ist(`${dueDay}T23:59:00`),
            billToName: "Shruti Menon",
            ...over,
        },
    });
}

/** Thursdays at 8:00 in Mumbai, inside the last 4 weeks. */
const THURSDAYS = ["2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15"];

describe("Insights suggestions (DB)", () => {
    let bakery = { id: "", storeId: "" };
    let other = { id: "", storeId: "" };
    let fresh = { id: "", storeId: "" };
    let quiet = { id: "", storeId: "" };
    let asha = "";
    let ravi = "";
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        asha = await person("Asha");
        ravi = await person("Ravi");
        bakery = await business("Bakery");
        other = await business("Other");
        fresh = await business("Fresh", new Date(NOW.getTime() - 10 * DAY));
        quiet = await business("Quiet");
        const org = bakery.id;

        // Classes. Sourdough: 9 of 10 at each of 4 sessions (90%), and one
        // cancelled place that doesn't count. Pilates: 35 of 40 (87%).
        // Yoga: 3 full sessions only. Baking: full but archived. One
        // full session of Pilates before the 4 weeks doesn't count.
        const sourdough = await classOf(org, "Sourdough class", 10);
        const pilates = await classOf(org, "Pilates", 10);
        const yoga = await classOf(org, "Yoga", 10);
        const baking = await classOf(org, "Baking", 5, {
            status: "ARCHIVED",
        });
        ids.sourdough = sourdough.id;
        ids.pilates = pilates.id;
        ids.yoga = yoga.id;
        ids.baking = baking.id;
        for (const day of THURSDAYS) {
            const at = ist(`${day}T08:00:00`);
            await session(org, sourdough.id, at, 9);
            await session(org, baking.id, at, 5);
        }
        await session(
            org,
            sourdough.id,
            ist(`${THURSDAYS[0]}T08:00:00`),
            1,
            "CANCELLED",
        );
        for (const [i, day] of THURSDAYS.entries()) {
            await session(
                org,
                pilates.id,
                ist(`${day}T18:00:00`),
                [9, 9, 9, 8][i],
            );
        }
        await session(org, pilates.id, ist("2026-09-17T18:00:00"), 10);
        for (const day of THURSDAYS.slice(1)) {
            await session(org, yoga.id, ist(`${day}T07:00:00`), 10);
        }

        // Bills. 22, 21 and 20 days late; one part paid; an order's own
        // bill and a credit note, both long late, are never owed; a paid
        // one is not owed either.
        ids.late22 = (
            await billDue(org, "2026-09-27", { paidCents: 100000 })
        ).id;
        ids.late21 = (await billDue(org, "2026-09-28")).id;
        ids.late20 = (await billDue(org, "2026-09-29")).id;
        ids.paid = (
            await billDue(org, "2026-08-01", {
                status: "PAID",
                paidAt: ist("2026-08-02T10:00:00"),
                paidCents: 250000,
            })
        ).id;
        const ordered = await sale(
            org,
            bakery.storeId,
            (await product(org, "Gift box")).id,
            1,
            ist("2026-07-01T10:00:00"),
        );
        ids.orderBill = (
            await billDue(org, "2026-08-01", { orderId: ordered.id })
        ).id;
        ids.creditNote = (
            await billDue(org, "2026-08-01", { kind: "CREDIT_NOTE" })
        ).id;

        // Products, 4 weeks against the 4 before. Croissant 10 → 6 (down
        // 40%), fires. Rye 9 → 0: too few before. Bun 12 → 9 (25% down):
        // not a third. Bagel 15 → 0 but archived.
        const croissant = await product(org, "Croissant box");
        const rye = await product(org, "Rye loaf");
        const bun = await product(org, "Cinnamon bun");
        const bagel = await product(org, "Bagel", {
            status: "ARCHIVED",
            archivedAt: NOW,
        });
        ids.croissant = croissant.id;
        ids.rye = rye.id;
        ids.bun = bun.id;
        ids.bagel = bagel.id;
        const before = ist("2026-09-05T11:00:00");
        const during = ist("2026-10-05T11:00:00");
        await sale(org, bakery.storeId, croissant.id, 10, before);
        await sale(org, bakery.storeId, croissant.id, 6, during);
        await sale(org, bakery.storeId, rye.id, 9, before);
        await sale(org, bakery.storeId, bun.id, 12, before);
        await sale(org, bakery.storeId, bun.id, 9, during);
        await sale(org, bakery.storeId, bagel.id, 15, before);

        // Another business with its own late bill.
        ids.otherBill = (await billDue(other.id, "2026-09-01")).id;
        await sale(
            other.id,
            other.storeId,
            (await product(other.id, "Tea")).id,
            1,
            during,
        );

        // A young business: sold 20 in its first days, nothing since. Too
        // young to say it sells less.
        const jam = await product(fresh.id, "Jam");
        await sale(
            fresh.id,
            fresh.storeId,
            jam.id,
            20,
            ist("2026-10-10T10:00:00"),
        );

        // Quiet: one sale, nothing to suggest.
        await sale(
            quiet.id,
            quiet.storeId,
            (await product(quiet.id, "Candle")).id,
            1,
            during,
        );
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("suggests the full class, the bill 22 days late and the product down a third, in that order", async () => {
        const read = await service.read(owner(bakery.id, asha), "4w", NOW);
        expect(read.money).toBe(true);
        expect(read.hasSales).toBe(true);
        expect(read.window).toEqual({
            days: 28,
            from: "2026-09-22",
            to: "2026-10-19",
            beforeFrom: "2026-08-25",
            beforeTo: "2026-09-21",
        });
        expect(read.suggestions.map((s) => s.key)).toEqual([
            `class-full:${ids.sourdough}`,
            `late-bill:${ids.late22}`,
            `selling-less:${ids.croissant}`,
        ]);
    });

    it("says what each card needs", async () => {
        const read = await service.read(owner(bakery.id, asha), "4w", NOW);
        const [cls, bill, less] = read.suggestions;
        expect(cls).toMatchObject({
            rule: "CLASS_FULL",
            service: { id: ids.sourdough, name: "Sourdough class" },
            days: 28,
            sessions: 4,
            seats: 40,
            booked: 36,
            fullPercent: 90,
            action: { kind: "ADD_CLASS_TIME" },
        });
        // What is left to pay on the part-paid bill, never its total.
        expect(bill).toMatchObject({
            rule: "LATE_BILL",
            invoice: { id: ids.late22 },
            billedTo: "Shruti Menon",
            leftToPayMinor: 150000,
            currency: "INR",
            dueOn: "2026-09-27",
            daysLate: 22,
            action: { kind: "REMIND", invoiceId: ids.late22 },
        });
        expect(less).toMatchObject({
            rule: "SELLING_LESS",
            product: { id: ids.croissant, name: "Croissant box" },
            sold: 6,
            soldBefore: 10,
            fewerPercent: 40,
            action: {
                kind: "OPEN_PRODUCT",
                href: `/commerce/products/${ids.croissant}`,
            },
        });
    });

    it("gives a role without money only the class rule", async () => {
        const read = await service.read(
            insightsOnly(bakery.id, ravi),
            "4w",
            NOW,
        );
        expect(read.money).toBe(false);
        expect(read.suggestions.map((s) => s.rule)).toEqual(["CLASS_FULL"]);
        expect(JSON.stringify(read)).not.toContain("leftToPay");
    });

    it("refuses a role without Insights", async () => {
        await expect(
            service.read(
                {
                    organizationId: bakery.id,
                    userId: ravi,
                    role: "MEMBER",
                    roleKey: "nothing",
                    actions: new Set<OrgAction>(),
                },
                "4w",
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("hides a Not now for that person only, and brings it back on day 8", async () => {
        const key = `late-bill:${ids.late22}`;
        const said = await service.notNow(owner(bakery.id, asha), key, NOW);
        expect(said).toEqual({
            key,
            hiddenUntil: "2026-10-26T03:30:00.000Z",
        });

        const keys = async (userId: string, at: Date) =>
            (
                await service.read(owner(bakery.id, userId), "4w", at)
            ).suggestions.map((s) => s.key);
        expect(await keys(asha, NOW)).not.toContain(key);
        expect(await keys(ravi, NOW)).toContain(key);
        expect(
            await keys(asha, new Date(NOW.getTime() + 7 * DAY - 1)),
        ).not.toContain(key);
        expect(await keys(asha, new Date(NOW.getTime() + 7 * DAY))).toContain(
            key,
        );
    });

    it("undoes a Not now at once", async () => {
        const key = `selling-less:${ids.croissant}`;
        await service.notNow(owner(bakery.id, asha), key, NOW);
        const hidden = await service.read(owner(bakery.id, asha), "4w", NOW);
        expect(hidden.suggestions.map((s) => s.key)).not.toContain(key);

        await service.undoNotNow(owner(bakery.id, asha), key);
        const back = await service.read(owner(bakery.id, asha), "4w", NOW);
        expect(back.suggestions.map((s) => s.key)).toContain(key);
    });

    it("keeps one row per person and key, and starts the 7 days again", async () => {
        const key = `class-full:${ids.sourdough}`;
        const ctx = owner(bakery.id, ravi);
        await service.notNow(ctx, key, NOW);
        const later = new Date(NOW.getTime() + 3 * DAY);
        const again = await service.notNow(ctx, key, later);
        expect(again.hiddenUntil).toBe(
            new Date(later.getTime() + 7 * DAY).toISOString(),
        );
        const rows = await prisma.insightSuggestionNotNow.findMany({
            where: { organizationId: bakery.id, userId: ravi, key },
        });
        expect(rows).toHaveLength(1);
        await service.undoNotNow(ctx, key);
    });

    it("clears a person's put-offs that have come back when they say Not now", async () => {
        const ctx = owner(quiet.id, asha);
        await service.notNow(ctx, "late-bill:gone1", NOW);
        await service.notNow(
            ctx,
            "late-bill:gone2",
            new Date(NOW.getTime() + 8 * DAY),
        );
        const left = await prisma.insightSuggestionNotNow.findMany({
            where: { organizationId: quiet.id, userId: asha },
            select: { key: true },
        });
        expect(left).toEqual([{ key: "late-bill:gone2" }]);
    });

    it("never lets one business's Not now hide another's", async () => {
        const key = `late-bill:${ids.otherBill}`;
        // Asha works in both. She puts the key off in the bakery...
        await service.notNow(owner(bakery.id, asha), key, NOW);
        // ...and the other business still shows her its bill.
        const read = await service.read(owner(other.id, asha), "4w", NOW);
        expect(read.suggestions.map((s) => s.key)).toContain(key);
    });

    it("refuses a key that isn't a suggestion", async () => {
        await expect(
            service.notNow(owner(bakery.id, asha), "first-sale", NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.undoNotNow(owner(bakery.id, asha), "drop table"),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("never compares a business younger than the two periods", async () => {
        const read = await service.read(owner(fresh.id, asha), "7d", NOW);
        expect(read.hasSales).toBe(true);
        expect(read.suggestions).toEqual([]);
    });

    it("suggests nothing when no rule applies", async () => {
        const read = await service.read(owner(quiet.id, ravi), "4w", NOW);
        expect(read.suggestions).toEqual([]);
    });

    it("offers the first-sale suggestion before any sale", async () => {
        const empty = await business("Empty");
        const read = await service.read(owner(empty.id, asha), "4w", NOW);
        expect(read.hasSales).toBe(false);
        expect(read.suggestions).toEqual([
            {
                key: "first-sale",
                rule: "FIRST_SALE",
                dismissible: false,
                action: { kind: "COPY_SHOP_LINK" },
            },
        ]);
    });
});
