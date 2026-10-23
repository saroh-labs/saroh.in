/**
 * Products running low (A14, DEC-171) against a real Postgres: only where a
 * stock level is set — a shelf for a product that counts stock, with an
 * alert above 0 — at or under its alert, lowest first, with how fast it
 * sold in the last 7 days; a product with no stock level, one that doesn't
 * count stock, a draft, a shelf short for orders (the short row's) and a
 * business that doesn't track stock give nothing; another business's
 * shelves never show. Runs plain and with TEST_RLS=on.
 */
import { prisma, runInOrgContext } from "@saroh/database";

import { stockLow } from "./home-site-stock-sources";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 14:30 in Mumbai.
const NOW = new Date("2026-10-19T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const clock = { now: NOW, zone: ZONE };

describe("Home A running low (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let untrackedOrgId = "";
    const shelves: Record<string, string> = {};
    let n = 0;

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `home-low-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function store(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `home-low-${name}-${tag}`.toLowerCase(),
                    organizationId,
                },
            })
        ).id;
    }

    async function shelf(
        name: string,
        organizationId: string,
        storeId: string,
        over: {
            onHand: number;
            promised?: number;
            alert?: number;
            tracked?: boolean;
            status?: string;
            noLevel?: boolean;
        },
    ) {
        n += 1;
        const product = await prisma.product.create({
            data: {
                organizationId,
                storeId,
                name,
                slug: `low-${n}-${tag}`,
                price: "100.00",
                status: over.status ?? "PUBLISHED",
                stockTracked: over.tracked ?? true,
            },
        });
        await prisma.productListing.create({
            data: { organizationId, storeId, productId: product.id },
        });
        if (over.noLevel) return;
        const level = await prisma.stockLevel.create({
            data: {
                organizationId,
                storeId,
                productId: product.id,
                onHand: over.onHand,
                promised: over.promised ?? 0,
                lowStockAlert: over.alert ?? 10,
            },
        });
        shelves[name] = level.id;
    }

    async function sold(
        organizationId: string,
        storeId: string,
        name: string,
        quantity: number,
        daysAgo: number,
    ) {
        n += 1;
        const level = await prisma.stockLevel.findUniqueOrThrow({
            where: { id: shelves[name] },
        });
        await prisma.order.create({
            data: {
                organizationId,
                storeId,
                orderId: `LOW-${n}-${tag}`,
                subtotal: "100.00",
                total: "100.00",
                currency: "INR",
                status: "DELIVERED",
                paymentStatus: "PAID",
                createdAt: new Date(NOW.getTime() - daysAgo * DAY),
                items: {
                    create: [
                        {
                            productId: level.productId,
                            stockLevelId: level.id,
                            quantity,
                            price: "100.00",
                        },
                    ],
                },
            },
        });
    }

    beforeAll(async () => {
        orgId = await business("Rye");
        otherOrgId = await business("Elsewhere");
        untrackedOrgId = await business("Kettle");
        const hill = await store(orgId, "Hill");
        const theirs = await store(otherOrgId, "Else");
        const kettle = await store(untrackedOrgId, "Kettle");
        await prisma.businessProfile.create({
            data: { organizationId: untrackedOrgId, stockTracking: false },
        });

        await shelf("Seeded multigrain loaf", orgId, hill, { onHand: 3 });
        await shelf("Rye starter kit", orgId, hill, { onHand: 1 });
        await shelf("Baguette", orgId, hill, { onHand: 0 });
        // At the alert exactly, and under it once orders take their share.
        await shelf("Brioche", orgId, hill, { onHand: 10 });
        await shelf("Focaccia", orgId, hill, { onHand: 14, promised: 5 });
        // Never low: plenty; alert 0; short for orders; doesn't count
        // stock; a draft; no stock level at all.
        await shelf("Ciabatta", orgId, hill, { onHand: 40 });
        await shelf("Croissant", orgId, hill, { onHand: 2, alert: 0 });
        await shelf("Pretzel", orgId, hill, { onHand: 2, promised: 5 });
        await shelf("Bagel", orgId, hill, { onHand: 2, tracked: false });
        await shelf("Stollen", orgId, hill, { onHand: 2, status: "DRAFT" });
        await shelf("Panettone", orgId, hill, { onHand: 0, noLevel: true });
        await shelf("Their loaf", otherOrgId, theirs, { onHand: 1 });
        await shelf("Kettle loaf", untrackedOrgId, kettle, { onHand: 1 });

        // Sold in the last 7 days: 63 multigrain, 3 starter kits; and 50
        // multigrain eight days ago, which doesn't count.
        await sold(orgId, hill, "Seeded multigrain loaf", 40, 1);
        await sold(orgId, hill, "Seeded multigrain loaf", 23, 6);
        await sold(orgId, hill, "Seeded multigrain loaf", 50, 8);
        await sold(orgId, hill, "Rye starter kit", 3, 2);
    });

    // The suite truncates every table after each file.

    const read = (organizationId: string) =>
        runInOrgContext(organizationId, () =>
            stockLow(prisma, organizationId, clock),
        );

    it("lists shelves at or under their alert, lowest first, with how fast they sell", async () => {
        const action = await read(orgId);
        expect(action?.code).toBe("COMMERCE_STOCK_LOW");
        expect(action?.count).toBe(5);
        expect(action?.late).toBe(1);
        expect(action?.evidence?.map((e) => [e.title, e.detail])).toEqual([
            ["Baguette", "None left"],
            ["Rye starter kit", "1 left · 3 sold in the last 7 days"],
            ["Seeded multigrain loaf", "3 left · sells about 9 a day"],
            ["Focaccia", "9 left"],
            ["Brioche", "10 left"],
        ]);
        expect(action?.evidence?.[0].href).toMatch(
            /^\/commerce\/stock\?product=/,
        );
    });

    it("never shows a product with no stock level, nor another business's", async () => {
        const action = await read(orgId);
        const titles = action?.evidence?.map((e) => e.title) ?? [];
        for (const never of [
            "Ciabatta",
            "Croissant",
            "Pretzel",
            "Bagel",
            "Stollen",
            "Panettone",
            "Their loaf",
        ]) {
            expect(titles).not.toContain(never);
        }
        const theirs = await read(otherOrgId);
        expect(theirs?.evidence?.map((e) => e.title)).toEqual(["Their loaf"]);
    });

    it("gives nothing for a business that doesn't track stock", async () => {
        expect(await read(untrackedOrgId)).toBeNull();
    });
});
