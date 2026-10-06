/**
 * Insights' takings (DEC-075) against a real Postgres: each sale counted
 * once, in the week it was paid in the business's own zone, net of what
 * went back; where it was sold; a business with no sales; one location
 * against two; and another business's money never in the figures. Runs
 * in the integration project (TEST_DATABASE_URL), plain and under
 * TEST_RLS=on, where `read` runs in the business's own RLS context.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { TakingsRead } from "./takings";
import { INVOICES_PLACE, locationPlace, ONLINE_PLACE } from "./takings";
import { TakingsService } from "./takings.service";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Sunday 4 Oct 2026, 15:30 in Mumbai: the twelve weeks are 6 Jul – 27 Sep.
const NOW = new Date("2026-10-04T10:00:00.000Z");

const service = new TakingsService();
let n = 0;

function ctx(organizationId: string): OrganizationContext {
    return { organizationId, userId: `user-${tag}`, role: "OWNER" };
}

async function business(name: string, stores: string[]) {
    const org = await prisma.organization.create({
        data: { name, slug: `takings-${name}-${tag}`.toLowerCase() },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    const storeIds: string[] = [];
    for (const storeName of stores) {
        const store = await prisma.store.create({
            data: {
                name: storeName,
                slug: `takings-${storeName}-${tag}`.toLowerCase(),
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
    paidAt: Date | null,
    extra: Record<string, unknown> = {},
) {
    n += 1;
    return prisma.order.create({
        data: {
            organizationId,
            storeId,
            orderId: `TK-${n}-${tag}`,
            subtotal: total,
            total,
            currency: "INR",
            paymentStatus: "PAID",
            paidAt,
            createdAt: paidAt ?? new Date("2026-09-01T06:00:00.000Z"),
            ...extra,
        },
    });
}

async function invoice(organizationId: string, data: Record<string, unknown>) {
    n += 1;
    return prisma.invoice.create({
        data: {
            organizationId,
            number: `TK-INV-${n}-${tag}`,
            status: "PAID",
            currency: "INR",
            subtotal: "0",
            total: "0",
            issuedAt: new Date("2026-08-01T06:00:00.000Z"),
            ...data,
        },
    });
}

async function refund(
    organizationId: string,
    orderId: string,
    cents: number,
    extra: Record<string, unknown> = {},
) {
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
            ...extra,
        },
    });
}

function week(read: TakingsRead, start: string) {
    const found = read.weeks.find((w) => w.start === start);
    if (!found) throw new Error(`no week ${start}`);
    return found;
}

describe("Insights takings (DB)", () => {
    let rye = { id: "", stores: [] as string[] };
    let kettle = { id: "", stores: [] as string[] };
    let quiet = { id: "", stores: [] as string[] };
    let elsewhere = { id: "", stores: [] as string[] };

    beforeAll(async () => {
        rye = await business("Rye", ["Hill Road", "Bandra"]);
        kettle = await business("Kettle", ["Kettle Lane"]);
        quiet = await business("Quiet", ["Quiet Corner"]);
        elsewhere = await business("Elsewhere", ["Elsewhere"]);
        const [hill, bandra] = rye.stores;

        // The zone's edge: Sunday 20 Sep 23:45 in Mumbai is the week of
        // 14 Sep; Monday 21 Sep 00:15 is the week of 21 Sep, though both
        // are Sunday in UTC.
        await order(rye.id, hill, "100", new Date("2026-09-20T18:15:00.000Z"));
        await order(rye.id, hill, "200", new Date("2026-09-20T18:45:00.000Z"));
        // Monday 28 Sep in Mumbai: the week in progress, read on its own.
        await order(rye.id, hill, "999", new Date("2026-09-27T18:45:00.000Z"));

        // The week of 21 Sep, at two locations and online.
        const refunded = await order(
            rye.id,
            bandra,
            "1000",
            new Date("2026-09-22T06:00:00.000Z"),
        );
        // ₹300 back counts off; a failed refund and one for an edit don't.
        await refund(rye.id, refunded.id, 30_000);
        await refund(rye.id, refunded.id, 50_000, { status: "FAILED" });
        await refund(rye.id, refunded.id, 20_000, { forEdit: true });
        // Its own invoice is the order's money, not a second sale.
        await invoice(rye.id, {
            orderId: refunded.id,
            source: "ORDER",
            total: "1000",
            paidAt: new Date("2026-09-22T06:00:00.000Z"),
        });
        await order(
            rye.id,
            bandra,
            "500",
            new Date("2026-09-23T06:00:00.000Z"),
            {
                placedOnline: true,
            },
        );
        // Refunded in full: nothing kept.
        await order(rye.id, hill, "800", new Date("2026-09-24T06:00:00.000Z"), {
            paymentStatus: "REFUNDED",
        });
        // Not paid: not money taken.
        await order(rye.id, hill, "700", null, {
            paymentStatus: "UNPAID",
            createdAt: new Date("2026-09-24T06:00:00.000Z"),
        });
        // Paid before `paidAt` was recorded: counted when it was placed.
        await order(rye.id, hill, "50", null, {
            createdAt: new Date("2026-09-25T06:00:00.000Z"),
        });

        // A hand-written invoice, ₹100 of it credited back; a draft credit
        // note gave nothing back.
        const billed = await invoice(rye.id, {
            total: "600",
            paidAt: new Date("2026-09-25T06:00:00.000Z"),
        });
        await invoice(rye.id, {
            kind: "CREDIT_NOTE",
            status: "ISSUED",
            relatedInvoiceId: billed.id,
            total: "100",
            paidAt: null,
        });
        await invoice(rye.id, {
            kind: "CREDIT_NOTE",
            status: "DRAFT",
            number: null,
            relatedInvoiceId: billed.id,
            total: "250",
            paidAt: null,
        });
        // An issued, unpaid invoice is owed, not taken.
        await invoice(rye.id, { status: "ISSUED", total: "900" });

        // The first money Rye ever took, before the twelve weeks.
        await order(rye.id, hill, "10", new Date("2026-05-04T06:00:00.000Z"));

        // Kettle: one location, two weeks of sales.
        await order(
            kettle.id,
            kettle.stores[0],
            "300",
            new Date("2026-09-15T06:00:00.000Z"),
        );
        await order(
            kettle.id,
            kettle.stores[0],
            "450",
            new Date("2026-09-22T06:00:00.000Z"),
        );

        // Another business's money in the same week must never show.
        const theirs = await order(
            elsewhere.id,
            elsewhere.stores[0],
            "5000",
            new Date("2026-09-22T06:00:00.000Z"),
        );
        await invoice(elsewhere.id, {
            total: "7000",
            paidAt: new Date("2026-09-22T06:00:00.000Z"),
        });
        // A refund of theirs never comes off Rye's figures.
        await refund(elsewhere.id, theirs.id, 40_000);
    });

    it("counts each sale in the week it was paid, in the business's zone", async () => {
        const read = await service.read(ctx(rye.id), NOW);
        expect(read.zone).toBe(ZONE);
        expect(read.currency).toBe("INR");
        expect(read.thisWeekStart).toBe("2026-09-28");
        expect(read.weeks).toHaveLength(12);
        expect(read.weeks[0].start).toBe("2026-07-06");
        expect(read.weeks[11]).toMatchObject({
            start: "2026-09-21",
            end: "2026-09-27",
        });
        expect(week(read, "2026-09-14")).toMatchObject({
            takingsMinor: 10_000,
            orders: 1,
        });
        // 200 + (1000 − 300) + 500 online + 50 + (600 − 100) by invoice.
        expect(week(read, "2026-09-21")).toMatchObject({
            takingsMinor: 195_000,
            orderTakingsMinor: 145_000,
            orders: 4,
            payments: 5,
        });
    });

    it("splits a week by location, online and invoices, the Orders list's places", async () => {
        const read = await service.read(ctx(rye.id), NOW);
        const [hill, bandra] = rye.stores;
        expect(week(read, "2026-09-21").places).toEqual([
            { key: locationPlace(bandra), takingsMinor: 70_000 },
            // A tie goes by key, so the order never shuffles.
            { key: INVOICES_PLACE, takingsMinor: 50_000 },
            { key: ONLINE_PLACE, takingsMinor: 50_000 },
            { key: locationPlace(hill), takingsMinor: 25_000 },
        ]);
        expect(read.locations).toBe(2);
        expect(read.places).toEqual(
            expect.arrayContaining([
                {
                    key: locationPlace(hill),
                    kind: "LOCATION",
                    name: "Hill Road",
                },
                {
                    key: locationPlace(bandra),
                    kind: "LOCATION",
                    name: "Bandra",
                },
                { key: ONLINE_PLACE, kind: "ONLINE", name: null },
                { key: INVOICES_PLACE, kind: "INVOICES", name: null },
            ]),
        );
    });

    it("reads the week in progress so far, beside the same days of last week", async () => {
        const read = await service.read(ctx(rye.id), NOW);
        // Sunday 4 Oct: Monday to Sunday so far, against all of last week.
        expect(read.thisWeek).toEqual({
            start: "2026-09-28",
            through: "2026-10-04",
            takingsMinor: 99_900,
            orders: 1,
            payments: 1,
            sameDaysLastWeekMinor: 195_000,
            sameDaysLastWeekPayments: 5,
        });
        // Never one of the twelve whole weeks.
        expect(read.weeks.map((w) => w.start)).not.toContain("2026-09-28");
    });

    it("dates the first money the business ever took", async () => {
        const read = await service.read(ctx(rye.id), NOW);
        expect(read.firstSaleOn).toBe("2026-05-04");
    });

    it("gives a business with one location one place", async () => {
        const read = await service.read(ctx(kettle.id), NOW);
        expect(read.locations).toBe(1);
        expect(read.places).toEqual([
            {
                key: locationPlace(kettle.stores[0]),
                kind: "LOCATION",
                name: "Kettle Lane",
            },
        ]);
        expect(week(read, "2026-09-14").takingsMinor).toBe(30_000);
        expect(week(read, "2026-09-21").takingsMinor).toBe(45_000);
        expect(read.firstSaleOn).toBe("2026-09-15");
    });

    it("gives a business with no sales twelve empty weeks and no first sale", async () => {
        const read = await service.read(ctx(quiet.id), NOW);
        expect(read.weeks).toHaveLength(12);
        expect(
            read.weeks.every((w) => w.takingsMinor === 0 && w.orders === 0),
        ).toBe(true);
        expect(read.places).toEqual([]);
        expect(read.firstSaleOn).toBeNull();
        expect(read.otherCurrencies).toEqual([]);
    });

    it("never counts another business's money", async () => {
        const read = await service.read(ctx(rye.id), NOW);
        const all = read.weeks.reduce((sum, w) => sum + w.takingsMinor, 0);
        expect(all).toBe(10_000 + 195_000);
        expect(read.places.map((p) => p.name)).not.toContain("Elsewhere");

        const theirs = await service.read(ctx(elsewhere.id), NOW);
        expect(week(theirs, "2026-09-21").takingsMinor).toBe(460_000 + 700_000);
    });

    it("is refused without payment:read, and to a role without Insights", async () => {
        const noPayments: OrganizationContext = {
            ...ctx(rye.id),
            role: "MEMBER",
            actions: new Set(["analytics:read"]),
        };
        await expect(service.read(noPayments, NOW)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.read({ ...ctx(rye.id), role: "MEMBER" }, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
