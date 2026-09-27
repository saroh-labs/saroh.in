// A plan's history (D2): what a change records, what it's called, who it
// names, and how the history is read a page at a time. The database is
// mocked; subscriptions.db.spec.ts writes and reads real rows.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            subscriptionPlan: { findFirst: jest.fn() },
            subscriptionPlanEvent: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
            },
            user: { findMany: jest.fn() },
        },
    };
});

import "reflect-metadata";

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { PlanSnapshot } from "./plan-events";
import {
    diffPlan,
    editKind,
    listPlanEvents,
    NO_PLAN,
    planActor,
    planSnapshot,
} from "./plan-events";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked>;

const MONTHLY: PlanSnapshot = {
    name: "Monthly",
    description: null,
    price: "1200.00",
    currency: "INR",
    interval: "MONTH",
    classesPerMonth: 8,
    status: "ACTIVE",
};

describe("what a change records", () => {
    it("says money as the wire does, whatever the Decimal's own digits", () => {
        const snap = planSnapshot({
            ...MONTHLY,
            price: { toString: () => "1200" },
        } as Parameters<typeof planSnapshot>[0]);
        expect(snap.price).toBe("1200.00");
    });

    it("keeps only the fields that changed, each as before and after", () => {
        expect(
            diffPlan(MONTHLY, {
                ...MONTHLY,
                price: "1500.00",
                classesPerMonth: null,
            }),
        ).toEqual({
            price: ["1200.00", "1500.00"],
            classesPerMonth: [8, null],
        });
        expect(diffPlan(MONTHLY, { ...MONTHLY })).toEqual({});
    });

    it("records a plan's first values from nothing, skipping what is still empty", () => {
        expect(diffPlan(NO_PLAN, MONTHLY)).toEqual({
            name: [null, "Monthly"],
            price: [null, "1200.00"],
            currency: [null, "INR"],
            interval: [null, "MONTH"],
            classesPerMonth: [null, 8],
            status: [null, "ACTIVE"],
        });
    });

    it("never records a field that isn't one of a plan's", () => {
        const after = { ...MONTHLY, updatedAt: "now" } as PlanSnapshot;
        expect(Object.keys(diffPlan(MONTHLY, after))).toEqual([]);
    });
});

describe("what an edit is called", () => {
    it.each([
        [{ price: ["1", "2"] }, "PRICE_CHANGED"],
        [{ interval: ["MONTH", "YEAR"] }, "PRICE_CHANGED"],
        [{ price: ["1", "2"], currency: ["INR", "USD"] }, "PRICE_CHANGED"],
        [{ classesPerMonth: [8, 12] }, "CLASSES_CHANGED"],
        [{ name: ["a", "b"] }, "RENAMED"],
        [{ description: [null, "x"] }, "DESCRIPTION_CHANGED"],
        [{ name: ["a", "b"], classesPerMonth: [8, null] }, "UPDATED"],
    ] as const)("%j is %s", (changes, kind) => {
        expect(editKind(changes as Parameters<typeof editKind>[0])).toBe(kind);
    });

    it("is nothing when nothing changed", () => {
        expect(editKind({})).toBeNull();
    });
});

describe("who a change is recorded as", () => {
    const ctx: OrganizationContext = {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
    };

    it("is the team member who made it", () => {
        expect(planActor(ctx)).toEqual({
            actorKind: "TEAM",
            actorUserId: "user_1",
        });
        expect(planActor({ ...ctx, roleKey: "front-desk" }).actorKind).toBe(
            "TEAM",
        );
    });

    it("is OPERATOR for a Saroh operator", () => {
        expect(
            planActor({ ...ctx, userId: "op_1", roleKey: "platform-operator" }),
        ).toEqual({ actorKind: "OPERATOR", actorUserId: "op_1" });
    });
});

describe("reading a plan's history", () => {
    const at = (s: string) => new Date(s);
    const row = (
        id: string,
        over: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
        id,
        kind: "PRICE_CHANGED",
        actorKind: "TEAM",
        actorUserId: "user_1",
        changes: { price: ["1200.00", "1500.00"] },
        createdAt: at("2026-09-03T10:00:00Z"),
        ...over,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        db.subscriptionPlan!.findFirst!.mockResolvedValue({ id: "plan_1" });
        db.subscriptionPlanEvent!.findFirst!.mockImplementation(
            (args: { where: { kind?: string } }) =>
                Promise.resolve(
                    args.where.kind === "CREATED" ? { id: "evt_0" } : null,
                ),
        );
        db.subscriptionPlanEvent!.findMany!.mockResolvedValue([]);
        db.user!.findMany!.mockResolvedValue([{ id: "user_1", name: "Priya" }]);
    });

    it("names who made each change, newest first, within the business", async () => {
        db.subscriptionPlanEvent!.findMany!.mockResolvedValue([row("evt_2")]);
        const page = await listPlanEvents("org_1", "plan_1");
        expect(page).toEqual({
            events: [
                {
                    id: "evt_2",
                    kind: "PRICE_CHANGED",
                    changes: { price: ["1200.00", "1500.00"] },
                    actor: { kind: "TEAM", userId: "user_1", name: "Priya" },
                    createdAt: "2026-09-03T10:00:00.000Z",
                },
            ],
            nextCursor: null,
            earlierUnrecorded: false,
        });
        const read = db.subscriptionPlanEvent!.findMany!.mock.calls[0]![0];
        expect(read.where).toEqual({
            organizationId: "org_1",
            planId: "plan_1",
        });
        expect(read.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    });

    it("shows a Saroh operator as Saroh support, never by name or id", async () => {
        db.subscriptionPlanEvent!.findMany!.mockResolvedValue([
            row("evt_3", { actorKind: "OPERATOR", actorUserId: "op_1" }),
            row("evt_2", { actorKind: "JOB", actorUserId: null }),
        ]);
        const page = await listPlanEvents("org_1", "plan_1");
        expect(page.events.map((e) => e.actor)).toEqual([
            { kind: "OPERATOR", userId: null, name: "Saroh support" },
            { kind: "JOB", userId: null, name: "Saroh" },
        ]);
        // Nobody's name was looked up: the operator isn't one to name.
        expect(db.user!.findMany).not.toHaveBeenCalled();
    });

    it("keeps a change by someone who has since left, with no name", async () => {
        db.subscriptionPlanEvent!.findMany!.mockResolvedValue([
            row("evt_2", { actorUserId: "gone" }),
        ]);
        db.user!.findMany!.mockResolvedValue([]);
        const page = await listPlanEvents("org_1", "plan_1");
        expect(page.events[0]!.actor).toEqual({
            kind: "TEAM",
            userId: "gone",
            name: null,
        });
    });

    it("pages by the last event, reading one more to know there is more", async () => {
        db.subscriptionPlanEvent!.findMany!.mockResolvedValue([
            row("evt_3"),
            row("evt_2"),
            row("evt_1"),
        ]);
        const page = await listPlanEvents("org_1", "plan_1", { limit: 2 });
        expect(page.events.map((e) => e.id)).toEqual(["evt_3", "evt_2"]);
        expect(page.nextCursor).toBe("evt_2");
        expect(db.subscriptionPlanEvent!.findMany!.mock.calls[0]![0].take).toBe(
            3,
        );
    });

    it("reads on from the cursor: older, or as old with a smaller id", async () => {
        const when = at("2026-09-03T10:00:00Z");
        db.subscriptionPlanEvent!.findFirst!.mockImplementation(
            (args: { where: { kind?: string; id?: string } }) =>
                Promise.resolve(
                    args.where.id === "evt_2"
                        ? { id: "evt_2", createdAt: when }
                        : null,
                ),
        );
        const page = await listPlanEvents("org_1", "plan_1", {
            cursor: "evt_2",
        });
        expect(
            db.subscriptionPlanEvent!.findFirst!.mock.calls[0]![0].where,
        ).toEqual({ organizationId: "org_1", planId: "plan_1", id: "evt_2" });
        expect(
            db.subscriptionPlanEvent!.findMany!.mock.calls[0]![0].where,
        ).toEqual({
            organizationId: "org_1",
            planId: "plan_1",
            OR: [
                { createdAt: { lt: when } },
                { createdAt: when, id: { lt: "evt_2" } },
            ],
        });
        // No CREATED event: made before the history was kept.
        expect(page.earlierUnrecorded).toBe(true);
    });

    it("refuses a cursor that isn't one of this plan's events", async () => {
        await expect(
            listPlanEvents("org_1", "plan_1", { cursor: "evt_other" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.subscriptionPlanEvent!.findMany).not.toHaveBeenCalled();
    });

    it("answers another business's plan with a 404 before reading its history", async () => {
        db.subscriptionPlan!.findFirst!.mockResolvedValue(null);
        await expect(
            listPlanEvents("org_1", "plan_other"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.subscriptionPlan!.findFirst).toHaveBeenCalledWith({
            where: { id: "plan_other", organizationId: "org_1" },
            select: { id: true },
        });
        expect(db.subscriptionPlanEvent!.findMany).not.toHaveBeenCalled();
    });

    it("keeps the page between 1 and 100", async () => {
        await listPlanEvents("org_1", "plan_1", { limit: 500 });
        await listPlanEvents("org_1", "plan_1", { limit: 0 });
        await listPlanEvents("org_1", "plan_1");
        const takes = db.subscriptionPlanEvent!.findMany!.mock.calls.map(
            ([a]) => a.take,
        );
        expect(takes).toEqual([101, 2, 51]);
    });
});
