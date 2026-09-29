/**
 * Order numbers are one series per business (P3, DEC-066), against a real
 * Postgres: the allocator every order takes its number from
 * (`nextOrderNumberInTx`), with two storefronts, orders racing, two
 * businesses and the API before P3 still numbering per storefront; and the
 * backfill (packages/database/src/backfill/order-numbers.ts) that seeds each
 * business's counter and renumbers the numbers two orders share — dry run
 * first, then for real, then again to prove it changes nothing.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    backfillOrderNumbers,
    nextOrderNumberInTx,
    prisma,
} from "@saroh/database";

const tag = `${process.pid}-${Date.now()}`;
let slugs = 0;

async function business(name: string, storefronts: number) {
    slugs += 1;
    const org = await prisma.organization.create({
        data: { name, slug: `p3-${slugs}-${tag}` },
    });
    const stores: string[] = [];
    for (let i = 0; i < storefronts; i++) {
        stores.push(
            (
                await prisma.store.create({
                    data: {
                        name: `${name} ${i + 1}`,
                        slug: `p3-${slugs}-${i}-${tag}`,
                        organizationId: org.id,
                    },
                })
            ).id,
        );
    }
    return { orgId: org.id, stores };
}

/** An order as the API makes one now: numbered by the business's series. */
async function takeOrder(orgId: string, storeId: string): Promise<string> {
    return prisma.$transaction(async (tx) => {
        const orderId = await nextOrderNumberInTx(tx, orgId);
        await tx.order.create({
            data: {
                storeId,
                organizationId: orgId,
                orderId,
                subtotal: "100.00",
                total: "100.00",
                currency: "INR",
            },
        });
        return orderId;
    });
}

/**
 * An order as the API before P3 made one: counted per storefront, with no
 * `renumberedFrom` (orders.service.ts before P3), retried on the
 * storefront's unique number.
 */
async function takeOrderAsBefore(
    orgId: string,
    storeId: string,
    at?: Date,
): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const count = await prisma.order.count({ where: { storeId } });
        const orderId = `ORD-${String(count + 1 + attempt).padStart(3, "0")}`;
        try {
            await prisma.order.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    orderId,
                    subtotal: "100.00",
                    total: "100.00",
                    currency: "INR",
                    ...(at ? { createdAt: at } : {}),
                },
            });
            return orderId;
        } catch (err) {
            if ((err as { code?: string }).code !== "P2002") throw err;
        }
    }
    throw new Error("Could not allocate an order number");
}

const numbersOf = async (orgId: string) =>
    (
        await prisma.order.findMany({
            where: { store: { organizationId: orgId } },
            select: { orderId: true },
        })
    )
        .map((o) => o.orderId)
        .sort();

const counterOf = async (orgId: string) =>
    (
        await prisma.orderNumberSequence.findUnique({
            where: { organizationId: orgId },
        })
    )?.lastNumber ?? null;

afterAll(async () => {
    await prisma.$disconnect();
});

describe("nextOrderNumberInTx — one series per business", () => {
    it("gives two storefronts of one business distinct numbers, in one sequence", async () => {
        const { orgId, stores } = await business("Rye", 2);
        const [hill, bandra] = stores as [string, string];
        const got = [
            await takeOrder(orgId, hill),
            await takeOrder(orgId, bandra),
            await takeOrder(orgId, hill),
            await takeOrder(orgId, bandra),
        ];
        expect(got).toEqual(["ORD-001", "ORD-002", "ORD-003", "ORD-004"]);
        expect(await counterOf(orgId)).toBe(4);
    });

    it("never gives one number twice when orders race, at either storefront", async () => {
        const { orgId, stores } = await business("Race", 2);
        const got = await Promise.all(
            Array.from({ length: 16 }, (_, i) =>
                takeOrder(orgId, stores[i % 2]!),
            ),
        );
        const want = Array.from(
            { length: 16 },
            (_, i) => `ORD-${String(i + 1).padStart(3, "0")}`,
        );
        // Distinct, and no number skipped.
        expect([...got].sort()).toEqual(want);
        expect(await numbersOf(orgId)).toEqual(want);
        expect(await counterOf(orgId)).toBe(16);
    });

    it("starts every business at ORD-001, whatever another has taken", async () => {
        const a = await business("First", 1);
        const b = await business("Second", 1);
        await takeOrder(a.orgId, a.stores[0]!);
        await takeOrder(a.orgId, a.stores[0]!);
        expect(await takeOrder(b.orgId, b.stores[0]!)).toBe("ORD-001");
        expect(await takeOrder(a.orgId, a.stores[0]!)).toBe("ORD-003");
    });

    it("gives its number back when the order fails", async () => {
        const { orgId, stores } = await business("Rollback", 1);
        await expect(
            prisma.$transaction(async (tx) => {
                await nextOrderNumberInTx(tx, orgId);
                throw new Error("the order failed");
            }),
        ).rejects.toThrow("the order failed");
        expect(await takeOrder(orgId, stores[0]!)).toBe("ORD-001");
    });

    it("continues after the business's highest number when it has no counter yet", async () => {
        const { orgId, stores } = await business("Before", 2);
        await takeOrderAsBefore(orgId, stores[0]!);
        await takeOrderAsBefore(orgId, stores[0]!);
        await takeOrderAsBefore(orgId, stores[1]!);
        // A number that is not the series' shape is left alone.
        await prisma.order.create({
            data: {
                storeId: stores[1]!,
                organizationId: orgId,
                orderId: "1001",
                subtotal: "1.00",
                total: "1.00",
            },
        });
        expect(await counterOf(orgId)).toBeNull();
        expect(await takeOrder(orgId, stores[1]!)).toBe("ORD-003");
    });

    it("keeps working beside the API before P3, stepping past a number it took", async () => {
        const { orgId, stores } = await business("Rollout", 2);
        const [hill, bandra] = stores as [string, string];
        expect(await takeOrder(orgId, hill)).toBe("ORD-001");
        // The previous image, counting per storefront, still writes: no
        // new constraint refuses it, and it needs no new column.
        expect(await takeOrderAsBefore(orgId, hill)).toBe("ORD-002");
        // The counter is at 1, but ORD-002 is taken: moved past it.
        expect(await takeOrder(orgId, bandra)).toBe("ORD-003");
        // Its own storefront count still reads 1 at Bandra, so the previous
        // image's ORD-002 there repeats a number — the backfill's to fix.
        expect(await takeOrderAsBefore(orgId, bandra)).toBe("ORD-002");
        expect(await takeOrder(orgId, hill)).toBe("ORD-004");
    });
});

describe("the P3 backfill", () => {
    const DAY = 86_400_000;
    const t0 = new Date("2026-09-01T06:00:00.000Z");
    const at = (d: number) => new Date(t0.getTime() + d * DAY);

    it("seeds each counter, renumbers the later of each shared number, and is idempotent", async () => {
        // Two storefronts that each counted from ORD-001, and the older
        // order of each pair at alternating storefronts.
        const shop = await business("Two shops", 2);
        const [hill, bandra] = shop.stores as [string, string];
        await takeOrderAsBefore(shop.orgId, hill, at(0)); // ORD-001 kept
        await takeOrderAsBefore(shop.orgId, bandra, at(1)); // ORD-001 → 004
        await takeOrderAsBefore(shop.orgId, bandra, at(2)); // ORD-002 kept
        await takeOrderAsBefore(shop.orgId, hill, at(3)); // ORD-002 → 005
        await takeOrderAsBefore(shop.orgId, hill, at(4)); // ORD-003 only
        // One storefront, no duplicates: only its counter is seeded.
        const single = await business("One shop", 1);
        await takeOrderAsBefore(single.orgId, single.stores[0]!, at(0));
        await takeOrderAsBefore(single.orgId, single.stores[0]!, at(1));
        const scope = { organizationIds: [shop.orgId, single.orgId] };

        const dry = await backfillOrderNumbers(prisma, {
            ...scope,
            dryRun: true,
        });
        expect(dry).toMatchObject({
            organizations: 2,
            countersSet: 2,
            dryRun: true,
        });
        expect(dry.renumbered.map((r) => [r.from, r.to])).toEqual([
            ["ORD-001", "ORD-004"],
            ["ORD-002", "ORD-005"],
        ]);
        // Nothing written.
        expect(await counterOf(shop.orgId)).toBeNull();
        expect(await counterOf(single.orgId)).toBeNull();
        expect(await numbersOf(shop.orgId)).toEqual([
            "ORD-001",
            "ORD-001",
            "ORD-002",
            "ORD-002",
            "ORD-003",
        ]);

        const first = await backfillOrderNumbers(prisma, scope);
        expect(first.renumbered).toEqual(dry.renumbered.map((r) => r));
        expect(first.countersSet).toBe(2);
        expect(await numbersOf(shop.orgId)).toEqual([
            "ORD-001",
            "ORD-002",
            "ORD-003",
            "ORD-004",
            "ORD-005",
        ]);
        const byTime = await prisma.order.findMany({
            where: { store: { organizationId: shop.orgId } },
            orderBy: { createdAt: "asc" },
            select: { storeId: true, orderId: true, renumberedFrom: true },
        });
        expect(byTime).toEqual([
            { storeId: hill, orderId: "ORD-001", renumberedFrom: null },
            { storeId: bandra, orderId: "ORD-004", renumberedFrom: "ORD-001" },
            { storeId: bandra, orderId: "ORD-002", renumberedFrom: null },
            { storeId: hill, orderId: "ORD-005", renumberedFrom: "ORD-002" },
            { storeId: hill, orderId: "ORD-003", renumberedFrom: null },
        ]);
        expect(await counterOf(shop.orgId)).toBe(5);
        expect(await counterOf(single.orgId)).toBe(2);

        // Again: nothing to do, nothing written.
        const again = await backfillOrderNumbers(prisma, scope);
        expect(again).toEqual({
            organizations: 2,
            countersSet: 0,
            renumbered: [],
            dryRun: false,
        });
        expect(await counterOf(shop.orgId)).toBe(5);

        // And the next order follows the series.
        expect(await takeOrder(shop.orgId, bandra)).toBe("ORD-006");
        expect(await takeOrder(single.orgId, single.stores[0]!)).toBe(
            "ORD-003",
        );
    });

    it("never lowers a counter, and keeps an order's first old number when run after a rollout", async () => {
        const { orgId, stores } = await business("Ahead", 2);
        const [hill, bandra] = stores as [string, string];
        await takeOrder(orgId, hill); // ORD-001
        await takeOrder(orgId, hill); // ORD-002
        await prisma.orderNumberSequence.update({
            where: { organizationId: orgId },
            data: { lastNumber: 10 },
        });
        // The API before P3, while it still served, repeated ORD-001.
        await takeOrderAsBefore(orgId, bandra);
        const report = await backfillOrderNumbers(prisma, {
            organizationIds: [orgId],
        });
        expect(report.renumbered.map((r) => [r.storeId, r.from, r.to])).toEqual(
            [[bandra, "ORD-001", "ORD-011"]],
        );
        expect(await counterOf(orgId)).toBe(11);
    });

    it("looks at every business with an order when none is named", async () => {
        const { orgId, stores } = await business("Everyone", 2);
        await takeOrderAsBefore(orgId, stores[0]!, at(0));
        await takeOrderAsBefore(orgId, stores[1]!, at(1));
        const report = await backfillOrderNumbers(prisma);
        expect(
            report.renumbered.filter((r) => r.organizationId === orgId),
        ).toHaveLength(1);
        expect(await numbersOf(orgId)).toEqual(["ORD-001", "ORD-002"]);
        const again = await backfillOrderNumbers(prisma);
        expect(again.renumbered).toEqual([]);
        expect(again.countersSet).toBe(0);
    });
});
