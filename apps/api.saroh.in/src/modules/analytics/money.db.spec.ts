/**
 * Insights' Money for one period (DEC-171) against a real Postgres: 4 weeks
 * and 7 days ending on a Monday in Mumbai, each against the same number of
 * days before; days turn at midnight in the business's zone; refunds
 * subtract; another currency is kept apart; a place that took nothing now
 * is left out; the usual order is the middle one; a young business is
 * never compared; a business with no sales says so; who owes reads what is
 * left to pay; and a role without payments is refused. Runs in the
 * integration project, plain and under TEST_RLS=on.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { INVOICES_PLACE, locationPlace, ONLINE_PLACE } from "./takings";
import { TakingsService } from "./takings.service";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai. 4 weeks: 22 Sep – 19 Oct against
// 25 Aug – 21 Sep. 7 days: 13 – 19 Oct against 6 – 12 Oct.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const DAY = 24 * 60 * 60 * 1000;

const service = new TakingsService();
let n = 0;

function ctx(organizationId: string): OrganizationContext {
    return { organizationId, userId: `user-${tag}`, role: "OWNER" };
}

async function business(
    name: string,
    stores: string[],
    createdAt = new Date("2026-01-05T06:00:00.000Z"),
) {
    const org = await prisma.organization.create({
        data: {
            name,
            slug: `money-${name}-${tag}`.toLowerCase(),
            createdAt,
        },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    const storeIds: string[] = [];
    for (const storeName of stores) {
        const store = await prisma.store.create({
            data: {
                name: storeName,
                slug: `money-${storeName}-${tag}`.toLowerCase(),
                organizationId: org.id,
                settings: { create: { currency: "INR" } },
            },
        });
        storeIds.push(store.id);
    }
    return { id: org.id, stores: storeIds };
}

async function order(
    organizationId: string,
    storeId: string,
    total: string,
    paidAt: Date,
    extra: Record<string, unknown> = {},
) {
    n += 1;
    return prisma.order.create({
        data: {
            organizationId,
            storeId,
            orderId: `MN-${n}-${tag}`,
            subtotal: total,
            total,
            currency: "INR",
            paymentStatus: "PAID",
            paidAt,
            createdAt: paidAt,
            ...extra,
        },
    });
}

async function invoice(organizationId: string, data: Record<string, unknown>) {
    n += 1;
    return prisma.invoice.create({
        data: {
            organizationId,
            number: `MN-INV-${n}-${tag}`,
            status: "PAID",
            currency: "INR",
            subtotal: "0",
            total: "0",
            issuedAt: new Date("2026-08-01T06:00:00.000Z"),
            ...data,
        },
    });
}

async function refund(organizationId: string, orderId: string, cents: number) {
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId,
            orderId,
            provider: "RAZORPAY",
            amountCents: 100_000,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
    await prisma.paymentRefund.create({
        data: {
            organizationId,
            paymentIntentId: intent.id,
            amountCents: cents,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
}

describe("Insights money (DB)", () => {
    let loom = { id: "", stores: [] as string[] };
    let young = { id: "", stores: [] as string[] };
    let quiet = { id: "", stores: [] as string[] };
    let elsewhere = { id: "", stores: [] as string[] };

    beforeAll(async () => {
        loom = await business("Loom", ["Hill Road", "Bandra"]);
        // Three weeks old: nothing earlier to compare with yet.
        young = await business(
            "Young",
            ["Young Lane"],
            new Date(NOW.getTime() - 21 * DAY),
        );
        quiet = await business("Quiet", ["Quiet Corner"]);
        elsewhere = await business("Elsewhere", ["Elsewhere"]);
        const [hill, bandra] = loom.stores;

        // The first money Loom ever took, long before.
        await order(loom.id, hill, "10", ist("2026-05-04T11:00"));

        // The 4 weeks, 22 Sep – 19 Oct.
        // 22 Sep 00:15 in Mumbai is still 21 Sep in UTC; ₹200 of ₹500 back.
        const early = await order(
            loom.id,
            hill,
            "500",
            ist("2026-09-22T00:15"),
        );
        await refund(loom.id, early.id, 20_000);
        // Bandra's, but placed at the website's checkout: online.
        await order(loom.id, bandra, "2000", ist("2026-10-01T12:00"), {
            placedOnline: true,
        });
        // Last Monday: one before 09:00 (the same time as now), one after.
        await order(loom.id, hill, "400", ist("2026-10-12T08:00"));
        await order(loom.id, hill, "999", ist("2026-10-12T20:00"));
        await order(loom.id, hill, "1000", ist("2026-10-13T10:00"));
        // Today, a bill paid in full.
        await invoice(loom.id, {
            total: "3000",
            paidAt: ist("2026-10-19T08:00"),
        });
        // Another currency, never added in.
        await order(loom.id, hill, "50", ist("2026-10-05T12:00"), {
            currency: "USD",
        });
        // Not money in: unpaid, and refunded in full.
        await order(loom.id, hill, "700", ist("2026-10-14T12:00"), {
            paymentStatus: "UNPAID",
            paidAt: null,
        });
        await order(loom.id, hill, "800", ist("2026-10-14T12:00"), {
            paymentStatus: "REFUNDED",
        });

        // The 4 weeks before, 25 Aug – 21 Sep. 21 Sep 23:30 in Mumbai.
        await order(loom.id, hill, "1500", ist("2026-09-21T23:30"));
        await order(loom.id, bandra, "500", ist("2026-09-01T12:00"));
        await order(loom.id, hill, "1000", ist("2026-08-26T12:00"));
        await invoice(loom.id, {
            total: "1000",
            paidAt: ist("2026-09-10T12:00"),
        });

        // Owed: ₹1,000 of ₹2,500 paid, not due; ₹800 five days late; ₹600
        // forty days late with ₹100 paid. A draft and an order's own bill
        // are never owed.
        await invoice(loom.id, {
            status: "ISSUED",
            total: "2500",
            paidCents: 100_000,
            dueAt: new Date(NOW.getTime() + 7 * DAY),
        });
        await invoice(loom.id, {
            status: "ISSUED",
            total: "800",
            dueAt: new Date(NOW.getTime() - 5 * DAY),
        });
        await invoice(loom.id, {
            status: "ISSUED",
            total: "600",
            paidCents: 10_000,
            dueAt: new Date(NOW.getTime() - 40 * DAY),
        });
        await invoice(loom.id, { status: "DRAFT", number: null, total: "999" });
        await invoice(loom.id, {
            status: "ISSUED",
            orderId: early.id,
            source: "ORDER",
            total: "500",
        });

        // Young: two weeks of sales.
        await order(young.id, young.stores[0], "300", ist("2026-10-08T12:00"));
        await order(young.id, young.stores[0], "600", ist("2026-10-15T12:00"));

        // Another business, same days: never in Loom's figures.
        await order(
            elsewhere.id,
            elsewhere.stores[0],
            "9000",
            ist("2026-10-13T10:00"),
        );
        await invoice(elsewhere.id, {
            status: "ISSUED",
            total: "4000",
            dueAt: new Date(NOW.getTime() - 5 * DAY),
        });
    });

    it("4 weeks on a Monday: money in against the 4 weeks before", async () => {
        const read = await service.money(ctx(loom.id), "4w", NOW);
        expect(read).toMatchObject({
            period: "4w",
            zone: ZONE,
            currency: "INR",
            otherCurrencies: ["USD"],
            window: {
                days: 28,
                from: "2026-09-22",
                to: "2026-10-19",
                beforeFrom: "2026-08-25",
                beforeTo: "2026-09-21",
            },
            thin: false,
            hasSales: true,
            firstSaleOn: "2026-05-04",
            startedOn: "2026-01-05",
        });
        // (500 − 200) + 2000 + 400 + 999 + 1000 + 3000 by bill.
        // Before: 1500 + 500 + 1000 + 1000 by bill.
        expect(read.moneyIn).toEqual({
            amountMinor: 769_900,
            beforeMinor: 400_000,
            change: { kind: "UP", percent: 92 },
            payments: 6,
            paymentsBefore: 4,
            orders: 5,
            ordersBefore: 3,
            bills: 1,
            billsBefore: 1,
        });
    });

    it("7 days on a Monday: Tuesday to today against the 7 before", async () => {
        const read = await service.money(ctx(loom.id), "7d", NOW);
        expect(read.window).toEqual({
            days: 7,
            from: "2026-10-13",
            to: "2026-10-19",
            beforeFrom: "2026-10-06",
            beforeTo: "2026-10-12",
        });
        expect(read.moneyIn).toMatchObject({
            amountMinor: 400_000,
            beforeMinor: 139_900,
            // Two payments the 7 days before: too few to say a percent.
            change: { kind: "THIN" },
        });
        // A bar a day, a day with nothing at zero, adding up to money in.
        expect(read.days.map((d) => d.date)).toEqual([
            "2026-10-13",
            "2026-10-14",
            "2026-10-15",
            "2026-10-16",
            "2026-10-17",
            "2026-10-18",
            "2026-10-19",
        ]);
        expect(read.days.reduce((sum, d) => sum + d.amountMinor, 0)).toBe(
            400_000,
        );
    });

    it("lists where the money came from, leaving out a place at nothing", async () => {
        const read = await service.money(ctx(loom.id), "4w", NOW);
        const [hill] = loom.stores;
        expect(read.places).toEqual([
            {
                key: INVOICES_PLACE,
                kind: "INVOICES",
                name: null,
                amountMinor: 300_000,
                beforeMinor: 100_000,
                change: { kind: "THIN" },
            },
            {
                key: locationPlace(hill),
                kind: "LOCATION",
                name: "Hill Road",
                amountMinor: 269_900,
                beforeMinor: 250_000,
                change: { kind: "THIN" },
            },
            {
                key: ONLINE_PLACE,
                kind: "ONLINE",
                name: null,
                amountMinor: 200_000,
                beforeMinor: 0,
                change: { kind: "THIN" },
            },
        ]);
        // Bandra took ₹500 before and nothing now: left out.
        expect(read.places.map((p) => p.name)).not.toContain("Bandra");
        expect(read.locations).toBe(2);
    });

    it("reads the usual order, the bars by window, the best week, this week and today", async () => {
        const read = await service.money(ctx(loom.id), "4w", NOW);
        // 300, 400, 999, 1000, 2000 now; 500, 1000, 1500 before.
        expect(read.usualOrder).toEqual({
            amountMinor: 99_900,
            beforeMinor: 100_000,
            orders: 5,
            ordersBefore: 3,
        });
        expect(read.weeks).toHaveLength(12);
        expect(read.weeks.map((w) => w.in)).toEqual([
            ...Array(4).fill(null),
            ...Array(4).fill("BEFORE"),
            ...Array(4).fill("PERIOD"),
        ]);
        // 12 – 18 Oct: 400 + 999 + 1000.
        expect(read.bestWeek).toEqual({
            start: "2026-10-12",
            end: "2026-10-18",
            takingsMinor: 239_900,
        });
        expect(read.thisWeek).toMatchObject({
            start: "2026-10-19",
            through: "2026-10-19",
            takingsMinor: 300_000,
        });
        // Last Monday to 09:00: the ₹400, not the ₹999 that evening.
        expect(read.today).toMatchObject({
            date: "2026-10-19",
            amountMinor: 300_000,
            payments: 1,
            sameWeekdayLastWeekMinor: 40_000,
            sameWeekdayLastWeekPayments: 1,
        });
    });

    it("3 months reaches back past the twelve weeks", async () => {
        const read = await service.money(ctx(loom.id), "3m", NOW);
        expect(read.window).toMatchObject({
            days: 92,
            from: "2026-07-20",
            beforeFrom: "2026-04-19",
            beforeTo: "2026-07-19",
        });
        // Everything since 20 Jul, and the first ₹10 in May before it.
        expect(read.moneyIn.amountMinor).toBe(769_900 + 400_000);
        expect(read.moneyIn.beforeMinor).toBe(1_000);
    });

    it("reads who owes by how late, as what is left to pay", async () => {
        const read = await service.money(ctx(loom.id), "4w", NOW);
        expect(read.owed).toMatchObject({
            totals: [
                { currency: "INR", amountMinor: 150_000 + 80_000 + 50_000 },
            ],
            bills: 3,
            overdue: 2,
            byAge: {
                notDue: {
                    count: 1,
                    totals: [{ currency: "INR", amountMinor: 150_000 }],
                },
                late1to30: {
                    count: 1,
                    totals: [{ currency: "INR", amountMinor: 80_000 }],
                },
                lateOver30: {
                    count: 1,
                    totals: [{ currency: "INR", amountMinor: 50_000 }],
                },
            },
        });
    });

    it("never compares a business younger than the two periods", async () => {
        const read = await service.money(ctx(young.id), "4w", NOW);
        expect(read).toMatchObject({
            thin: true,
            ageDays: 21,
            startedOn: "2026-09-28",
            hasSales: true,
        });
        expect(read.moneyIn).toMatchObject({
            amountMinor: 90_000,
            change: { kind: "THIN" },
        });
        // Never billed outside an order: no "₹0 owed".
        expect(read.owed).toBeNull();
        // 7 days is shorter than its age: compared as usual.
        const week = await service.money(ctx(young.id), "7d", NOW);
        expect(week.thin).toBe(false);
    });

    it("tells a business with no sales so", async () => {
        const read = await service.money(ctx(quiet.id), "4w", NOW);
        expect(read).toMatchObject({
            hasSales: false,
            firstSaleOn: null,
            places: [],
            bestWeek: null,
            usualOrder: { amountMinor: null, orders: 0 },
        });
        expect(read.moneyIn.amountMinor).toBe(0);
        expect(read.weeks.every((w) => w.takingsMinor === 0)).toBe(true);
    });

    it("never counts another business's money or bills", async () => {
        const read = await service.money(ctx(loom.id), "7d", NOW);
        expect(read.moneyIn.amountMinor).toBe(400_000);
        const theirs = await service.money(ctx(elsewhere.id), "7d", NOW);
        expect(theirs.moneyIn.amountMinor).toBe(900_000);
        expect(theirs.owed?.totals).toEqual([
            { currency: "INR", amountMinor: 400_000 },
        ]);
    });

    it("leaves owed out without invoice:read, and refuses a role without payments", async () => {
        const noInvoices: OrganizationContext = {
            ...ctx(loom.id),
            role: "MEMBER",
            actions: new Set(["analytics:read", "payment:read"]),
        };
        const read = await service.money(noInvoices, "4w", NOW);
        expect(read.owed).toBeNull();
        expect(read.moneyIn.amountMinor).toBe(769_900);

        const noPayments: OrganizationContext = {
            ...ctx(loom.id),
            role: "MEMBER",
            actions: new Set(["analytics:read", "invoice:read"]),
        };
        await expect(
            service.money(noPayments, "4w", NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.money({ ...ctx(loom.id), role: "MEMBER" }, "4w", NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
