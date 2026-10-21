/**
 * Insights' What sells for one period (DEC-171) against a real Postgres:
 * the 4 weeks to Monday 19 Oct in Mumbai against the 4 before. Variants
 * roll up into their product; a refunded order and a cancelled or waiting
 * booking never count; a line refunded in part counts what was kept;
 * another currency adds units, never money; class fill counts a session
 * whose places were all cancelled; one person with two storefront
 * customers and a bill is one customer; days and hours turn at midnight in
 * the business's zone; a young business is never compared; each section
 * is empty on its own; and amounts and names follow the role. Runs in the
 * integration project, plain and under TEST_RLS=on.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { onTheLedger } from "../../../test/ledger-paid";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SellsService } from "./sells.service";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai. 4 weeks: 22 Sep – 19 Oct against
// 25 Aug – 21 Sep.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

const service = new SellsService();
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
        data: { name, slug: `sells-${name}-${tag}`.toLowerCase(), createdAt },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    const storeIds: string[] = [];
    for (const storeName of stores) {
        const store = await prisma.store.create({
            data: {
                name: storeName,
                slug: `sells-${storeName}-${tag}`.toLowerCase(),
                organizationId: org.id,
                settings: { create: { currency: "INR" } },
            },
        });
        storeIds.push(store.id);
    }
    return { id: org.id, stores: storeIds };
}

async function product(organizationId: string, name: string, price: string) {
    n += 1;
    return prisma.product.create({
        data: { organizationId, name, slug: `p-${n}-${tag}`, price },
    });
}

interface Line {
    productId: string;
    variantId?: string;
    quantity: number;
    price: string;
}

async function order(
    organizationId: string,
    storeId: string,
    paidAt: Date,
    lines: Line[],
    extra: Record<string, unknown> = {},
) {
    n += 1;
    const total = lines
        .reduce((sum, l) => sum + Number(l.price) * l.quantity, 0)
        .toFixed(2);
    return prisma.order.create({
        data: {
            organizationId,
            storeId,
            orderId: `SL-${n}-${tag}`,
            subtotal: total,
            total,
            currency: "INR",
            paymentStatus: "PAID",
            paidAt,
            createdAt: paidAt,
            items: {
                create: lines.map((l) => ({
                    productId: l.productId,
                    variantId: l.variantId ?? null,
                    quantity: l.quantity,
                    price: l.price,
                })),
            },
            ...extra,
        },
        include: { items: true },
    });
}

async function contact(
    organizationId: string,
    firstName: string,
    extra: Record<string, unknown> = {},
) {
    n += 1;
    return prisma.contact.create({
        data: {
            organizationId,
            firstName,
            email: `${firstName.toLowerCase()}.${n}@example.com`,
            ...extra,
        },
    });
}

/** A storefront customer at `storeId`, linked to `contactId`. */
async function shopper(
    organizationId: string,
    storeId: string,
    contactId: string,
) {
    n += 1;
    const customer = await prisma.customer.create({
        data: { organizationId, storeId, email: `shop.${n}@example.com` },
    });
    await prisma.customerIdentityLink.create({
        data: { organizationId, contactId, customerId: customer.id },
    });
    return customer.id;
}

async function bill(
    organizationId: string,
    contactId: string,
    total: string,
    paidAt: Date,
) {
    n += 1;
    // Paid on its ledger (DEC-173): the money-in rule reads it.
    return onTheLedger(
        await prisma.invoice.create({
            data: {
                organizationId,
                contactId,
                number: `SL-INV-${n}-${tag}`,
                status: "PAID",
                currency: "INR",
                subtotal: total,
                total,
                issuedAt: paidAt,
                paidAt,
            },
        }),
    );
}

async function serviceOf(
    organizationId: string,
    name: string,
    capacity: number,
) {
    return prisma.service.create({
        data: {
            organizationId,
            name,
            durationMinutes: 60,
            capacity,
            timezone: ZONE,
        },
    });
}

async function book(
    organizationId: string,
    serviceId: string,
    startAt: Date,
    over: {
        contactId?: string;
        bookerEmail?: string;
        status?: string;
        outcome?: string | null;
    } = {},
) {
    return prisma.booking.create({
        data: {
            organizationId,
            serviceId,
            startAt,
            endAt: new Date(startAt.getTime() + 60 * MIN),
            timezone: ZONE,
            status: over.status ?? "CONFIRMED",
            outcome: over.outcome ?? null,
            contactId: over.contactId ?? null,
            bookerEmail: over.bookerEmail ?? null,
            snapshot: {},
        },
    });
}

describe("Insights what sells (DB)", () => {
    let bakery = { id: "", stores: [] as string[] };
    let young = { id: "", stores: [] as string[] };
    let quiet = { id: "", stores: [] as string[] };
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        bakery = await business("Bakery", ["Hill Road", "Bandra"]);
        young = await business(
            "Young",
            ["Young Lane"],
            new Date(NOW.getTime() - 21 * DAY),
        );
        quiet = await business("Quiet", ["Quiet Corner"]);
        const org = bakery.id;
        const [hill, bandra] = bakery.stores;

        const sourdough = await product(org, "Sourdough loaf", "180");
        const small = await prisma.productVariant.create({
            data: {
                productId: sourdough.id,
                sku: `SD-S-${tag}`,
                title: "Small",
            },
        });
        const large = await prisma.productVariant.create({
            data: {
                productId: sourdough.id,
                sku: `SD-L-${tag}`,
                title: "Large",
            },
        });
        const multigrain = await product(org, "Seeded multigrain loaf", "200");
        const croissant = await product(org, "Croissant", "50");
        const rye = await product(org, "Rye starter kit", "400");
        const bun = await product(org, "Cinnamon bun", "90");
        const bagel = await product(org, "Bagel", "60");
        ids.sourdough = sourdough.id;
        ids.multigrain = multigrain.id;
        ids.croissant = croissant.id;
        ids.rye = rye.id;
        ids.bun = bun.id;

        // People. Shruti buys at both storefronts and is billed as a trade
        // customer: one person.
        const shruti = await contact(org, "Shruti", {
            lastName: "Menon",
            company: "Café Bloom",
        });
        const arjun = await contact(org, "Arjun");
        const kavya = await contact(org, "Kavya");
        const neha = await contact(org, "Neha");
        const ravi = await contact(org, "Ravi");
        const gone = await contact(org, "Gone", { removedAt: new Date() });
        ids.shruti = shruti.id;
        ids.arjun = arjun.id;
        ids.kavya = kavya.id;
        ids.neha = neha.id;
        ids.ravi = ravi.id;
        const shrutiHill = await shopper(org, hill, shruti.id);
        const shrutiBandra = await shopper(org, bandra, shruti.id);
        const arjunHill = await shopper(org, hill, arjun.id);
        const nehaHill = await shopper(org, hill, neha.id);

        // The 4 weeks, 22 Sep – 19 Oct.
        // Sourdough in two sizes: 5 units, ₹900.
        await order(
            org,
            hill,
            ist("2026-10-01T12:00"),
            [
                {
                    productId: sourdough.id,
                    variantId: small.id,
                    quantity: 3,
                    price: "180",
                },
                {
                    productId: sourdough.id,
                    variantId: large.id,
                    quantity: 2,
                    price: "180",
                },
            ],
            { customerId: shrutiHill },
        );
        await order(
            org,
            bandra,
            ist("2026-10-10T12:00"),
            [{ productId: multigrain.id, quantity: 2, price: "200" }],
            { customerId: shrutiBandra, placedOnline: true },
        );
        await bill(org, shruti.id, "5000", ist("2026-10-08T15:00"));
        for (const day of ["2026-10-05", "2026-10-12"]) {
            await order(
                org,
                hill,
                ist(`${day}T17:00`),
                [{ productId: sourdough.id, quantity: 1, price: "180" }],
                { customerId: arjunHill, fulfilment: "LOCAL_DELIVERY" },
            );
        }
        // A walk-in on a Saturday morning: 2 of 4 croissants refunded.
        const walkIn = await order(
            org,
            hill,
            ist("2026-10-03T08:00"),
            [
                { productId: rye.id, quantity: 1, price: "400" },
                { productId: croissant.id, quantity: 4, price: "50" },
                { productId: bun.id, quantity: 1, price: "90" },
                { productId: bagel.id, quantity: 1, price: "60" },
            ],
            { walkInName: "Walk-in" },
        );
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: org,
                orderId: walkIn.id,
                provider: "RAZORPAY",
                amountCents: 75_000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        const refund = await prisma.paymentRefund.create({
            data: {
                organizationId: org,
                paymentIntentId: intent.id,
                amountCents: 10_000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        const croissantLine = walkIn.items.find(
            (i) => i.productId === croissant.id,
        );
        await prisma.paymentRefundLine.create({
            data: {
                organizationId: org,
                paymentRefundId: refund.id,
                orderItemId: croissantLine?.id ?? "",
                quantity: 2,
                amountCents: 10_000,
            },
        });
        // Sunday 19:30 in Mumbai is 14:00 in UTC: the evening, not the
        // afternoon.
        await order(
            org,
            hill,
            ist("2026-10-18T19:30"),
            [{ productId: croissant.id, quantity: 1, price: "50" }],
            { customerId: nehaHill },
        );
        // 22 Sep 00:15 in Mumbai is still 21 Sep in UTC: in the period, and
        // outside the four parts of the day.
        await order(org, hill, ist("2026-09-22T00:15"), [
            { productId: multigrain.id, quantity: 1, price: "200" },
        ]);
        // Another currency: its units count, its money never.
        await order(
            org,
            hill,
            ist("2026-10-07T11:00"),
            [{ productId: croissant.id, quantity: 2, price: "5" }],
            { currency: "USD" },
        );
        // Refunded in full and never paid: neither counts.
        await order(
            org,
            hill,
            ist("2026-10-14T12:00"),
            [{ productId: sourdough.id, quantity: 10, price: "180" }],
            { paymentStatus: "REFUNDED" },
        );
        await order(
            org,
            hill,
            ist("2026-10-14T12:00"),
            [{ productId: sourdough.id, quantity: 10, price: "180" }],
            { paymentStatus: "UNPAID", paidAt: null },
        );
        // Someone removed for privacy paid a bill: never a best customer.
        await bill(org, gone.id, "9000", ist("2026-10-09T12:00"));

        // The 4 weeks before, 25 Aug – 21 Sep.
        await order(
            org,
            hill,
            ist("2026-09-10T12:00"),
            [{ productId: sourdough.id, quantity: 4, price: "180" }],
            { customerId: shrutiHill },
        );
        // 21 Sep 23:30 in Mumbai: the period before.
        await order(org, hill, ist("2026-09-21T23:30"), [
            { productId: multigrain.id, quantity: 1, price: "200" },
        ]);
        await order(org, hill, ist("2026-09-01T12:00"), [
            { productId: croissant.id, quantity: 3, price: "50" },
        ]);

        // Bookings. A class of 4: Saturday 10 Oct full and everyone came;
        // Saturday 17 Oct two places (one didn't come) and one cancelled;
        // Saturday 3 Oct everyone cancelled.
        const cls = await serviceOf(org, "Sourdough basics class", 4);
        const tasting = await serviceOf(org, "Cake tasting", 1);
        ids.cls = cls.id;
        ids.tasting = tasting.id;
        const s1 = ist("2026-10-10T08:00");
        await book(org, cls.id, s1, {
            contactId: kavya.id,
            outcome: "ATTENDED",
        });
        for (const who of ["a", "b", "c"]) {
            await book(org, cls.id, s1, {
                bookerEmail: `${who}@example.com`,
                outcome: "ATTENDED",
            });
        }
        const s2 = ist("2026-10-17T08:00");
        await book(org, cls.id, s2, {
            contactId: kavya.id,
            outcome: "ATTENDED",
        });
        await book(org, cls.id, s2, {
            bookerEmail: "d@example.com",
            outcome: "NO_SHOW",
        });
        await book(org, cls.id, s2, {
            bookerEmail: "e@example.com",
            status: "CANCELLED",
        });
        await book(org, cls.id, ist("2026-10-03T08:00"), {
            bookerEmail: "f@example.com",
            status: "CANCELLED",
        });
        await bill(org, kavya.id, "1200", ist("2026-10-02T10:00"));
        // One-to-one: Ravi came on Wednesday afternoon; one still to come;
        // one waiting for its payment, not booked yet.
        await book(org, tasting.id, ist("2026-10-14T14:00"), {
            contactId: ravi.id,
            outcome: "ATTENDED",
        });
        await book(org, tasting.id, ist("2026-10-19T17:00"), {
            bookerEmail: "g@example.com",
        });
        await book(org, tasting.id, ist("2026-10-16T17:00"), {
            bookerEmail: "h@example.com",
            status: "PENDING",
        });
        // Arjun came to a tasting in August: he came back.
        await book(org, tasting.id, ist("2026-08-01T12:00"), {
            contactId: arjun.id,
            outcome: "ATTENDED",
        });

        // Young: three weeks old, two loaves sold.
        const youngLoaf = await product(young.id, "Young loaf", "100");
        await order(young.id, young.stores[0], ist("2026-10-15T12:00"), [
            { productId: youngLoaf.id, quantity: 2, price: "100" },
        ]);
    });

    it("rolls variants up, counts what was kept, and ranks the top five", async () => {
        const read = await service.read(ctx(bakery.id), "4w", NOW);

        expect(read.window).toEqual({
            days: 28,
            from: "2026-09-22",
            to: "2026-10-19",
            beforeFrom: "2026-08-25",
            beforeTo: "2026-09-21",
        });
        expect(read.thin).toBe(false);
        expect(read.money).toBe(true);
        expect(read.currency).toBe("INR");
        expect(read.bestSellers.total).toBe(6);
        expect(read.bestSellers.rows.map((r) => r.name)).toEqual([
            "Sourdough loaf",
            "Croissant",
            "Seeded multigrain loaf",
            "Rye starter kit",
            "Cinnamon bun",
        ]);
        const [sourdough, croissant, multigrain, rye] = read.bestSellers.rows;
        // 3 small + 2 large + Arjun's two; the refunded ten never.
        expect(sourdough).toMatchObject({
            sold: 7,
            soldBefore: 4,
            amountMinor: 126_000,
            beforeMinor: 72_000,
            change: { kind: "UP", percent: 75 },
            isNew: false,
        });
        // 2 of 4 kept, Neha's one, and two in dollars (units only).
        expect(croissant).toMatchObject({
            sold: 5,
            soldBefore: 3,
            amountMinor: 15_000,
            change: { kind: "UP", percent: 67 },
        });
        // 00:15 on 22 Sep is in; 23:30 on 21 Sep is before. One before is
        // too few to compare.
        expect(multigrain).toMatchObject({
            sold: 3,
            soldBefore: 1,
            amountMinor: 60_000,
            change: { kind: "THIN" },
            isNew: false,
        });
        expect(rye).toMatchObject({ sold: 1, soldBefore: 0, isNew: true });
    });

    it("says how full a class was, counting a session everyone cancelled", async () => {
        const read = await service.read(ctx(bakery.id), "4w", NOW);

        expect(read.booked.bookings).toBe(8);
        expect(read.booked.enough).toBe(true);
        expect(read.booked.total).toBe(2);
        const [cls, tasting] = read.booked.rows;
        // 4 + 2 places in 3 sessions of 4: 6 of 12.
        expect(cls).toMatchObject({
            serviceId: ids.cls,
            kind: "CLASS",
            bookings: 6,
            people: 5,
            sessions: 3,
            seats: 12,
            fullPercent: 50,
        });
        // Ravi's and the one still to come; the one waiting to pay never.
        expect(tasting).toMatchObject({
            serviceId: ids.tasting,
            kind: "ONE_TO_ONE",
            bookings: 2,
            sessions: null,
            seats: null,
            fullPercent: null,
        });
    });

    it("finds the busiest and quietest times in the business's zone", async () => {
        const read = await service.read(ctx(bakery.id), "4w", NOW);
        const { busiest } = read;
        const cell = (dow: number, part: number) =>
            busiest.cells.find((c) => c.dow === dow && c.part === part);

        expect(busiest.cells).toHaveLength(28);
        // Saturday 7 to 10: five came to class, one walk-in paid.
        expect(busiest.busiest).toMatchObject({
            dow: 6,
            part: 0,
            orders: 1,
            bookings: 5,
            total: 6,
        });
        expect(busiest.quietest?.total).toBe(0);
        // Sunday 19:30 in Mumbai: 4 to 8, not 1 to 4.
        expect(cell(7, 3)?.orders).toBe(1);
        expect(cell(7, 2)?.orders).toBe(0);
        // Wednesday 14:00: Ravi's tasting.
        expect(cell(3, 2)?.bookings).toBe(1);
        // 00:15 is outside the four parts.
        expect(busiest.outside).toBe(1);
        expect(busiest.total).toBe(13);
        expect(busiest.enough).toBe(true);
    });

    it("ranks customers by what they paid, one person once", async () => {
        const read = await service.read(ctx(bakery.id), "4w", NOW);
        const { customers } = read;

        expect(customers.total).toBe(5);
        expect(customers.cameBack).toBe(2);
        expect(customers.firstTime).toBe(3);
        expect(customers.rows.map((r) => r.contactId)).toEqual([
            ids.shruti,
            ids.kavya,
            ids.arjun,
            ids.neha,
            ids.ravi,
        ]);
        const [shruti, kavya, arjun, neha, ravi] = customers.rows;
        expect(shruti).toMatchObject({
            name: "Shruti Menon",
            company: "Café Bloom",
            amountMinor: 630_000,
            orders: 2,
            bills: 1,
            online: true,
            inStore: true,
            buysMost: "Sourdough loaf",
        });
        expect(kavya).toMatchObject({
            amountMinor: 120_000,
            classes: 2,
            bills: 1,
            buysMost: "Sourdough basics class",
        });
        expect(arjun).toMatchObject({
            amountMinor: 36_000,
            orders: 2,
            deliveries: 2,
        });
        expect(neha).toMatchObject({ amountMinor: 5_000, orders: 1 });
        expect(ravi).toMatchObject({
            amountMinor: 0,
            bookings: 1,
            buysMost: "Cake tasting",
        });
    });

    it("takes the last 7 days on their own", async () => {
        const read = await service.read(ctx(bakery.id), "7d", NOW);

        expect(read.window.from).toBe("2026-10-13");
        expect(read.bestSellers.rows.map((r) => [r.name, r.sold])).toEqual([
            ["Croissant", 1],
        ]);
        expect(read.booked.bookings).toBe(4);
    });

    it("shows counts and no money to a role without payments, and no names without customers", async () => {
        const countsOnly: OrganizationContext = {
            ...ctx(bakery.id),
            role: "MEMBER",
            actions: new Set(["analytics:read"]),
        };
        const read = await service.read(countsOnly, "4w", NOW);

        expect(read.money).toBe(false);
        expect(read.names).toBe(false);
        expect(read.currency).toBeNull();
        expect(read.bestSellers.rows[0]).toMatchObject({
            name: "Sourdough loaf",
            sold: 7,
            amountMinor: null,
            beforeMinor: null,
        });
        expect(read.customers.total).toBe(5);
        for (const row of read.customers.rows) {
            expect(row.amountMinor).toBeNull();
            expect(row.name).toBeNull();
            expect(row.company).toBeNull();
            expect(row.contactId).toBeNull();
        }

        const withNames: OrganizationContext = {
            ...countsOnly,
            actions: new Set(["analytics:read", "contact:read"]),
        };
        const named = await service.read(withNames, "4w", NOW);
        expect(named.names).toBe(true);
        expect(named.customers.rows.map((r) => r.name)).toContain(
            "Shruti Menon",
        );
        expect(named.customers.rows.every((r) => r.amountMinor === null)).toBe(
            true,
        );
    });

    it("refuses a role without Insights", async () => {
        await expect(
            service.read({ ...ctx(bakery.id), role: "MEMBER" }, "4w", NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("never compares a young business, and says it is too early", async () => {
        const read = await service.read(ctx(young.id), "4w", NOW);

        expect(read.thin).toBe(true);
        expect(read.ageDays).toBe(21);
        expect(read.bestSellers.rows).toEqual([
            expect.objectContaining({
                name: "Young loaf",
                sold: 2,
                change: { kind: "THIN" },
                isNew: false,
            }),
        ]);
        expect(read.booked).toMatchObject({
            rows: [],
            bookings: 0,
            enough: false,
        });
        expect(read.busiest.enough).toBe(false);
    });

    it("answers each section empty for a business with nothing yet", async () => {
        const read = await service.read(ctx(quiet.id), "4w", NOW);

        expect(read.bestSellers).toEqual({ rows: [], total: 0 });
        expect(read.booked).toEqual({
            rows: [],
            total: 0,
            bookings: 0,
            enough: false,
        });
        expect(read.busiest).toMatchObject({
            busiest: null,
            quietest: null,
            total: 0,
            enough: false,
        });
        expect(read.customers).toEqual({
            rows: [],
            total: 0,
            cameBack: 0,
            firstTime: 0,
        });
    });

    it("never reads another business's sales", async () => {
        const read = await service.read(ctx(quiet.id), "3m", NOW);
        expect(read.bestSellers.total).toBe(0);
        expect(read.customers.total).toBe(0);
    });
});
