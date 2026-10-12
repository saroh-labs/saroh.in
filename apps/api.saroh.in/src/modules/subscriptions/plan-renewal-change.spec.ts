// What publishing a plan's GST does to the members already on it, said in
// the Plan Editor before Publish (12 Oct 2026), and the rate a registered
// business's plan needs before it is published. The database is a fake
// passed in; the real rows are in `subscriptions.gst.db.spec.ts`.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {},
}));

import "reflect-metadata";

import type { PlanValues } from "./plan-draft-view";
import {
    GST_RATE_NEEDED,
    planProblems,
    renewalChangeOf,
} from "./plan-draft-view";

const decimal = (s: string) => ({ toString: () => s });

const VALUES: PlanValues = {
    name: "Gym monthly",
    description: null,
    price: "2000.00",
    currency: "INR",
    interval: "MONTH",
    classesPerMonth: null,
    gstRate: null,
    sacCode: null,
    gstPriceMode: null,
};

/** A fake client: who is on the plan, their autopay, and the business. */
function fake(input: {
    members?: { price: string; count: number }[];
    mandates?: { max: number; price: string }[];
    mode?: "INCLUDED" | "ADDED";
    registered?: boolean;
    nameClash?: boolean;
}) {
    return {
        customerSubscription: {
            groupBy: jest.fn().mockResolvedValue(
                (input.members ?? []).map((m) => ({
                    price: decimal(m.price),
                    currency: "INR",
                    _count: { _all: m.count },
                })),
            ),
        },
        paymentMandate: {
            findMany: jest.fn().mockResolvedValue(
                (input.mandates ?? []).map((m) => ({
                    maxAmountCents: m.max,
                    subscription: { price: decimal(m.price) },
                })),
            ),
        },
        businessProfile: {
            findUnique: jest.fn().mockResolvedValue({
                gstRegistered: input.registered ?? true,
                taxId: "29ABCDE1234F1Z5",
                gstState: "29",
                gstPriceMode: input.mode ?? "INCLUDED",
            }),
        },
        subscriptionPlan: {
            findFirst: jest
                .fn()
                .mockResolvedValue(
                    input.nameClash
                        ? { id: "plan_2", name: "Gym monthly" }
                        : null,
                ),
        },
    };
}

const change = (
    db: ReturnType<typeof fake>,
    live: Partial<PlanValues>,
    next: Partial<PlanValues>,
) =>
    renewalChangeOf(
        db as never,
        "org_1",
        "plan_1",
        { ...VALUES, ...live },
        { ...VALUES, ...next },
    );

describe("what publishing a plan's GST does to its members' next renewal", () => {
    it("is nothing to say when the GST is as published, and reads nothing", async () => {
        const db = fake({ members: [{ price: "2000", count: 12 }] });
        await expect(
            change(db, { gstRate: "18" }, { gstRate: "18", name: "Gym" }),
        ).resolves.toBeNull();
        expect(db.customerSubscription.groupBy).not.toHaveBeenCalled();
    });

    it("is nothing to say when nobody is on the plan", async () => {
        const db = fake({ members: [], mode: "ADDED" });
        await expect(change(db, {}, { gstRate: "18" })).resolves.toBeNull();
    });

    it("counts only members on the plan now: active or paused", async () => {
        const db = fake({ members: [{ price: "2000", count: 1 }] });
        await change(db, {}, { gstRate: "18" });
        expect(db.customerSubscription.groupBy.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            planId: "plan_1",
            status: { in: ["ACTIVE", "PAUSED"] },
        });
    });

    it("under 'includes GST' nobody's amount changes: ₹2,000 stays ₹2,000", async () => {
        const db = fake({
            members: [{ price: "2000", count: 12 }],
            mode: "INCLUDED",
        });
        await expect(change(db, {}, { gstRate: "18" })).resolves.toEqual({
            members: 12,
            groups: [
                {
                    members: 12,
                    currency: "INR",
                    from: "2000.00",
                    to: "2000.00",
                },
            ],
            changed: 0,
            aboveAutopayLimit: 0,
        });
        // Nobody pays more, so no autopay limit is asked about.
        expect(db.paymentMandate.findMany).not.toHaveBeenCalled();
    });

    it("under 'GST is added' a rate set moves every member: ₹2,000 becomes ₹2,360", async () => {
        const db = fake({
            members: [{ price: "2000", count: 12 }],
            mode: "ADDED",
        });
        await expect(change(db, {}, { gstRate: "18" })).resolves.toEqual({
            members: 12,
            groups: [
                {
                    members: 12,
                    currency: "INR",
                    from: "2000.00",
                    to: "2360.00",
                },
            ],
            changed: 12,
            aboveAutopayLimit: 0,
        });
    });

    it("works each member's amount from the price they are on, not the plan's", async () => {
        // Two joined at ₹1,800 before a price rise; ten are on ₹2,000.
        const db = fake({
            members: [
                { price: "1800", count: 2 },
                { price: "2000", count: 10 },
            ],
            mode: "ADDED",
        });
        const result = await change(
            db,
            {},
            { gstRate: "18", price: "2500.00" },
        );
        expect(result?.groups).toEqual([
            { members: 2, currency: "INR", from: "1800.00", to: "2124.00" },
            { members: 10, currency: "INR", from: "2000.00", to: "2360.00" },
        ]);
        expect(result?.changed).toBe(12);
    });

    it("switching one plan to 'GST is added' moves its members; switching back moves them back", async () => {
        const db = fake({
            members: [{ price: "2000", count: 3 }],
            mode: "INCLUDED",
        });
        const added = await change(
            db,
            { gstRate: "18" },
            { gstRate: "18", gstPriceMode: "ADDED" },
        );
        expect(added?.groups[0]).toMatchObject({
            from: "2000.00",
            to: "2360.00",
        });
        const back = await change(
            db,
            { gstRate: "18", gstPriceMode: "ADDED" },
            { gstRate: "18", gstPriceMode: null },
        );
        expect(back?.groups[0]).toMatchObject({
            from: "2360.00",
            to: "2000.00",
        });
        expect(back?.changed).toBe(3);
    });

    it("a rate changed from 5% to 18% where GST is added says both amounts", async () => {
        const db = fake({
            members: [{ price: "2000", count: 4 }],
            mode: "ADDED",
        });
        const result = await change(db, { gstRate: "5" }, { gstRate: "18" });
        expect(result?.groups[0]).toMatchObject({
            from: "2100.00",
            to: "2360.00",
        });
    });

    it("an exempt rate (0%) changes nobody's amount", async () => {
        const db = fake({
            members: [{ price: "2000", count: 4 }],
            mode: "ADDED",
        });
        const result = await change(db, {}, { gstRate: "0" });
        expect(result?.changed).toBe(0);
    });

    it("a business that is not registered charges no GST, so nothing changes", async () => {
        const db = fake({
            members: [{ price: "2000", count: 4 }],
            mode: "ADDED",
            registered: false,
        });
        const result = await change(db, {}, { gstRate: "18" });
        expect(result?.changed).toBe(0);
        expect(result?.groups[0]).toMatchObject({
            from: "2000.00",
            to: "2000.00",
        });
    });

    it("counts the members whose autopay limit is below the new amount: they are never charged above it", async () => {
        const db = fake({
            members: [{ price: "2000", count: 3 }],
            // One limit set at exactly the price, one at ₹2,360, one at ₹3,000.
            mandates: [
                { max: 200_000, price: "2000" },
                { max: 236_000, price: "2000" },
                { max: 300_000, price: "2000" },
            ],
            mode: "ADDED",
        });
        const result = await change(db, {}, { gstRate: "18" });
        // ₹2,360 is over ₹2,000 only; at the limit exactly is within it.
        expect(result?.aboveAutopayLimit).toBe(1);
        expect(db.paymentMandate.findMany.mock.calls[0][0].where).toMatchObject(
            {
                organizationId: "org_1",
                status: "ACTIVE",
                maxAmountCents: { not: null },
            },
        );
    });
});

describe("what stops a plan being published", () => {
    it("a registered business's priced plan needs a GST rate", async () => {
        const db = fake({ registered: true });
        await expect(
            planProblems(db as never, "org_1", "plan_1", VALUES),
        ).resolves.toEqual([{ field: "gstRate", message: GST_RATE_NEEDED }]);
    });

    it("Exempt (0%) is a rate", async () => {
        const db = fake({ registered: true });
        await expect(
            planProblems(db as never, "org_1", "plan_1", {
                ...VALUES,
                gstRate: "0",
            }),
        ).resolves.toEqual([]);
        // Nothing is asked of the business once a rate is there.
        expect(db.businessProfile.findUnique).not.toHaveBeenCalled();
    });

    it("a business that is not registered is never asked for one", async () => {
        const db = fake({ registered: false });
        await expect(
            planProblems(db as never, "org_1", "plan_1", VALUES),
        ).resolves.toEqual([]);
    });

    it("a plan with no price yet is asked for the price first, not the rate", async () => {
        const db = fake({ registered: true });
        await expect(
            planProblems(db as never, "org_1", "plan_1", {
                ...VALUES,
                price: null,
            }),
        ).resolves.toEqual([{ field: "price", message: "Set a price" }]);
        expect(db.businessProfile.findUnique).not.toHaveBeenCalled();
    });
});
