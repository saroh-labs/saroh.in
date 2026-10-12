// Price history (owner, 12 Oct 2026): what an entry holds, when one is
// written, and how an item's entries are read. The database is mocked; the
// rows a real one keeps are in `products/price-history.db.spec.ts`.
jest.mock("@saroh/database", () => ({
    prisma: {
        auditEvent: { findMany: jest.fn(), create: jest.fn() },
        user: { findMany: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import type { PriceFacts } from "./price-history";
import {
    centsFact,
    changesOf,
    courseFacts,
    modeFact,
    moneyFact,
    optionFacts,
    priceChanges,
    productFacts,
    rateFact,
    readPriceHistory,
    recordPrices,
    serviceFacts,
} from "./price-history";

const db = prisma as unknown as {
    auditEvent: { findMany: jest.Mock; create: jest.Mock };
    user: { findMany: jest.Mock };
};
const tx = { auditEvent: db.auditEvent } as never;
const decimal = (value: string) => ({ toString: () => value });

const asha = { organizationId: "org_1", userId: "u_asha", roleKey: "OWNER" };
const loaf = {
    kind: "PRODUCT",
    id: "p_1",
    name: "Rye loaf",
    currency: "INR",
} as const;
const facts = (over: Partial<PriceFacts> = {}): PriceFacts => ({
    price: "780.00",
    mrp: null,
    gstRate: "5",
    gstPriceMode: null,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    db.user.findMany.mockResolvedValue([]);
});

describe("a value as the stream writes it", () => {
    it("an amount is major units with two decimals, however it was stored", () => {
        expect(moneyFact("780")).toBe("780.00");
        expect(moneyFact(decimal("780.5"))).toBe("780.50");
        expect(moneyFact(" 1000.00 ")).toBe("1000.00");
        expect(moneyFact(null)).toBeNull();
        expect(moneyFact(undefined)).toBeNull();
        expect(moneyFact("")).toBeNull();
        expect(centsFact(150_000)).toBe("1500.00");
        expect(centsFact(0)).toBe("0.00");
        expect(centsFact(null)).toBeNull();
    });

    it("a rate is written as GST writes it, and 0 is a rate of its own", () => {
        expect(rateFact(decimal("18.00"))).toBe("18");
        expect(rateFact("0.25")).toBe("0.25");
        expect(rateFact("0")).toBe("0");
        expect(rateFact(null)).toBeNull();
        expect(rateFact("")).toBeNull();
    });

    it("a mode is the item's own, or the same as the business", () => {
        expect(modeFact("ADDED")).toBe("ADDED");
        expect(modeFact("INCLUDED")).toBe("INCLUDED");
        expect(modeFact(null)).toBeNull();
        expect(modeFact("nonsense")).toBeNull();
    });

    it("reads each kind's row", () => {
        expect(
            productFacts({
                price: decimal("780"),
                mrp: decimal("1000"),
                gstRate: decimal("5.00"),
                gstPriceMode: "ADDED",
            }),
        ).toEqual({
            price: "780.00",
            mrp: "1000.00",
            gstRate: "5",
            gstPriceMode: "ADDED",
        });
        // An option's rate and mode are its product's: they never move.
        expect(optionFacts({ price: decimal("500"), mrp: null })).toEqual({
            price: "500.00",
            mrp: null,
            gstRate: null,
            gstPriceMode: null,
        });
        // A service and a course have no MRP.
        expect(
            serviceFacts({ priceCents: 150_000, gstRate: decimal("18") }),
        ).toEqual({ price: "1500.00", gstRate: "18", gstPriceMode: null });
        expect(
            courseFacts({ price: decimal("8000"), gstPriceMode: "INCLUDED" }),
        ).toEqual({
            price: "8000.00",
            gstRate: null,
            gstPriceMode: "INCLUDED",
        });
    });
});

describe("what moved", () => {
    it("names each field that changed, in the order a line says them", () => {
        expect(
            priceChanges(
                facts(),
                facts({
                    price: "820.00",
                    mrp: "1000.00",
                    gstRate: "18",
                    gstPriceMode: "ADDED",
                }),
            ),
        ).toEqual([
            { field: "price", before: "780.00", after: "820.00" },
            { field: "mrp", before: null, after: "1000.00" },
            { field: "gstRate", before: "5", after: "18" },
            { field: "gstPriceMode", before: null, after: "ADDED" },
        ]);
    });

    it("says nothing when nothing about the cost moved", () => {
        expect(priceChanges(facts(), facts())).toEqual([]);
    });

    it("a value taken away is a change to nothing", () => {
        expect(
            priceChanges(facts({ mrp: "1000.00" }), facts({ mrp: null })),
        ).toEqual([{ field: "mrp", before: "1000.00", after: null }]);
    });

    it("a first entry is every value the item starts with", () => {
        expect(priceChanges(null, facts())).toEqual([
            { field: "price", before: null, after: "780.00" },
            { field: "gstRate", before: null, after: "5" },
        ]);
    });
});

describe("recording an entry", () => {
    it("writes one entry on the transaction it is given, with who and what", async () => {
        await expect(
            recordPrices(tx, asha, loaf, facts(), facts({ price: "820.00" })),
        ).resolves.toBe(true);
        expect(db.auditEvent.create).toHaveBeenCalledTimes(1);
        expect(db.auditEvent.create).toHaveBeenCalledWith({
            data: {
                action: "price.changed",
                actorUserId: "u_asha",
                organizationId: "org_1",
                targetType: "product",
                targetId: "p_1",
                outcome: "SUCCESS",
                metadata: {
                    kind: "PRODUCT",
                    name: "Rye loaf",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: "780.00", after: "820.00" },
                    ],
                },
            },
        });
    });

    it("writes nothing when nothing moved", async () => {
        await expect(
            recordPrices(tx, asha, loaf, facts(), facts()),
        ).resolves.toBe(false);
        expect(db.auditEvent.create).not.toHaveBeenCalled();
    });

    it("a first entry is price.set, and one with nothing to start at is not written", async () => {
        await recordPrices(tx, asha, loaf, null, facts(), "import");
        expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({
            action: "price.set",
            metadata: { source: "import" },
        });
        db.auditEvent.create.mockClear();
        // A service made with no price, rate or mode has no history yet.
        await expect(
            recordPrices(
                tx,
                asha,
                { kind: "SERVICE", id: "s_1", name: "Trial", currency: null },
                null,
                { price: null, gstRate: null, gstPriceMode: null },
            ),
        ).resolves.toBe(false);
        expect(db.auditEvent.create).not.toHaveBeenCalled();
    });

    it("an option's entry is on its product and names the option", async () => {
        await recordPrices(
            tx,
            asha,
            { ...loaf, option: { id: "v_1", title: "Large" } },
            optionFacts({ price: "500" }),
            optionFacts({ price: "550" }),
        );
        expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({
            targetType: "product",
            targetId: "p_1",
            metadata: {
                option: { id: "v_1", title: "Large" },
                changes: [
                    { field: "price", before: "500.00", after: "550.00" },
                ],
            },
        });
    });

    it("marks a Saroh operator's change, and names a job as the system", async () => {
        await recordPrices(
            tx,
            { ...asha, roleKey: "platform-operator" },
            loaf,
            facts(),
            facts({ price: "820.00" }),
        );
        expect(
            db.auditEvent.create.mock.calls[0][0].data.metadata.byOperator,
        ).toBe(true);
        await recordPrices(
            tx,
            { organizationId: "org_1", userId: null },
            loaf,
            facts(),
            facts({ price: "900.00" }),
        );
        expect(db.auditEvent.create.mock.calls[1][0].data).toMatchObject({
            actorUserId: "system:prices",
        });
        expect(
            db.auditEvent.create.mock.calls[1][0].data.metadata.byOperator,
        ).toBeUndefined();
    });
});

describe("an entry's changes as recorded", () => {
    it("reads the fields it knows and drops anything else", () => {
        expect(
            changesOf("price.changed", {
                changes: [
                    { field: "price", before: "780.00", after: "820.00" },
                    { field: "sku", before: "A", after: "B" },
                    "nonsense",
                ],
            }),
        ).toEqual([{ field: "price", before: "780.00", after: "820.00" }]);
        expect(changesOf("price.changed", null)).toEqual([]);
    });

    it("an old gst-rate.set row reads as a change of the GST rate", () => {
        expect(
            changesOf("gst-rate.set", {
                kind: "SERVICE",
                name: "Personal Training",
                from: null,
                to: "18",
            }),
        ).toEqual([{ field: "gstRate", before: null, after: "18" }]);
        expect(
            changesOf("gst-rate.set", { kind: "PRODUCT", from: "5", to: "18" }),
        ).toEqual([{ field: "gstRate", before: "5", after: "18" }]);
    });
});

describe("reading an item's history", () => {
    const row = (over: Record<string, unknown>) => ({
        id: "e_1",
        action: "price.changed",
        actorUserId: "u_asha",
        organizationId: "org_1",
        targetType: "product",
        targetId: "p_1",
        outcome: "SUCCESS",
        createdAt: new Date("2026-10-12T06:30:00.000Z"),
        metadata: {
            kind: "PRODUCT",
            name: "Rye loaf",
            currency: "INR",
            source: "editor",
            changes: [{ field: "price", before: "780.00", after: "820.00" }],
        },
        ...over,
    });

    it("asks for this business's entries about this item, newest first, capped", async () => {
        db.auditEvent.findMany.mockResolvedValue([]);
        await readPriceHistory("org_1", "PRODUCT", "p_1");
        expect(db.auditEvent.findMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                targetType: "product",
                targetId: "p_1",
                action: { in: ["price.set", "price.changed", "gst-rate.set"] },
                outcome: "SUCCESS",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 21,
        });
        await readPriceHistory("org_1", "SERVICE", "s_1", { limit: 500 });
        expect(db.auditEvent.findMany.mock.calls[1][0]).toMatchObject({
            where: { targetType: "service", targetId: "s_1" },
            take: 51,
        });
        await readPriceHistory("org_1", "COURSE", "c_1", {
            limit: 5,
            cursor: "e_9",
        });
        expect(db.auditEvent.findMany.mock.calls[2][0]).toMatchObject({
            where: { targetType: "course", targetId: "c_1" },
            take: 6,
            cursor: { id: "e_9" },
            skip: 1,
        });
    });

    it("gives each entry with the person's name as it is now, never an email", async () => {
        db.auditEvent.findMany.mockResolvedValue([row({})]);
        db.user.findMany.mockResolvedValue([{ id: "u_asha", name: "Asha" }]);
        const page = await readPriceHistory("org_1", "PRODUCT", "p_1");
        expect(db.user.findMany).toHaveBeenCalledWith({
            where: { id: { in: ["u_asha"] } },
            select: { id: true, name: true },
        });
        expect(page).toEqual({
            entries: [
                {
                    id: "e_1",
                    at: "2026-10-12T06:30:00.000Z",
                    first: false,
                    who: { name: "Asha" },
                    option: null,
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: "780.00", after: "820.00" },
                    ],
                },
            ],
            nextCursor: null,
        });
    });

    it("says when there are more, and where the next page starts", async () => {
        db.auditEvent.findMany.mockResolvedValue([
            row({ id: "e_3" }),
            row({ id: "e_2" }),
            row({ id: "e_1" }),
        ]);
        const page = await readPriceHistory("org_1", "PRODUCT", "p_1", {
            limit: 2,
        });
        expect(page.entries.map((e) => e.id)).toEqual(["e_3", "e_2"]);
        expect(page.nextCursor).toBe("e_2");
    });

    it("a Saroh operator is Saroh support and is never looked up; a job is Saroh", async () => {
        db.auditEvent.findMany.mockResolvedValue([
            row({
                id: "e_op",
                actorUserId: "u_operator",
                metadata: {
                    byOperator: true,
                    changes: [{ field: "gstRate", before: "5", after: "18" }],
                },
            }),
            row({ id: "e_job", actorUserId: "system:prices" }),
        ]);
        const page = await readPriceHistory("org_1", "PRODUCT", "p_1");
        expect(db.user.findMany).not.toHaveBeenCalled();
        expect(page.entries.map((e) => e.who)).toEqual([
            { name: "Saroh support", operator: true },
            { name: "Saroh", system: true },
        ]);
    });

    it("someone no longer here is nobody, and a first entry and an option say so", async () => {
        db.auditEvent.findMany.mockResolvedValue([
            row({
                action: "price.set",
                actorUserId: "u_gone",
                metadata: {
                    currency: "INR",
                    source: "copy",
                    option: { id: "v_1", title: "Large" },
                    changes: [
                        { field: "price", before: null, after: "500.00" },
                    ],
                },
            }),
        ]);
        const [entry] = (await readPriceHistory("org_1", "PRODUCT", "p_1"))
            .entries;
        expect(entry).toMatchObject({
            first: true,
            who: null,
            option: "Large",
            source: "copy",
        });
    });

    it("still reads a row the rates sheet wrote as gst-rate.set", async () => {
        db.auditEvent.findMany.mockResolvedValue([
            row({
                id: "e_old",
                action: "gst-rate.set",
                targetType: "service",
                targetId: "s_1",
                metadata: {
                    kind: "SERVICE",
                    name: "Personal Training",
                    from: null,
                    to: "18",
                },
            }),
        ]);
        db.user.findMany.mockResolvedValue([{ id: "u_asha", name: "Asha" }]);
        const page = await readPriceHistory("org_1", "SERVICE", "s_1");
        expect(page.entries).toEqual([
            {
                id: "e_old",
                at: "2026-10-12T06:30:00.000Z",
                first: false,
                who: { name: "Asha" },
                option: null,
                currency: null,
                source: "rates",
                changes: [{ field: "gstRate", before: null, after: "18" }],
            },
        ]);
    });
});
