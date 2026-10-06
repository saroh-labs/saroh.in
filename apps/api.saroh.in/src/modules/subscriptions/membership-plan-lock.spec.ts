/**
 * Memberships are a paid feature, checked where they are set up (6 Oct
 * 2026): on a Saroh plan without the catalogue's `subscriptions` row (or
 * without `payments`), creating a membership plan, creating or publishing a
 * draft, and selling an archived plan again are 403 `MODULE_LOCKED`.
 * Changing a plan's wording, publishing a live plan's changes and archiving
 * stay open, so a business that moved down can tidy up. Behind
 * `PLAN_ENFORCEMENT`: off, nothing asks. The database is mocked; the real
 * one is `membership-plan-lock.db.spec.ts`.
 */
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn().mockResolvedValue(0),
        subscriptionPlan: {
            findFirst: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        subscriptionPlanEvent: {
            create: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn().mockResolvedValue(null),
        },
        businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        store: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return {
        ...actual,
        prisma: {
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});
jest.mock("../stores/currency", () => ({
    businessCurrency: jest.fn().mockResolvedValue("INR"),
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";
import { createPlanDraft, publishPlan } from "./plan-drafts";
import type { PlanActor } from "./plan-events";
import { createPlanRow, setPlanStatusRow, updatePlanRow } from "./plan-writes";

type Mocked = Record<string, jest.Mock>;
const tx = (prisma as unknown as { __tx: Record<string, Mocked> }).__tx;
const plans = tx.subscriptionPlan!;

const ORG = "org_1";
const actor: PlanActor = { actorKind: "TEAM", actorUserId: "user_1" };
const WHOLE = {
    name: "Monthly",
    price: "1500",
    currency: "INR",
    interval: "MONTH" as const,
};

/** A plan row as the editor's writes read it. */
function row(over: Record<string, unknown> = {}) {
    return {
        id: "plan_1",
        status: "ACTIVE",
        name: "Monthly",
        description: null,
        price: "1500",
        currency: "INR",
        interval: "MONTH",
        classesPerMonth: null,
        pendingChanges: null,
        pendingChangedAt: null,
        pendingChangedById: null,
        draftRevision: 3,
        ...over,
    };
}

/** The plan read back by id; a name lookup finds no clash. */
function planIs(found: Record<string, unknown>) {
    plans.findFirst!.mockImplementation((args: { where: { name?: unknown } }) =>
        Promise.resolve(args.where.name ? null : found),
    );
}

/** The business is on a made-up plan; null: enforcement off, nothing asks. */
function onPlan(planId: "free" | "grow" | null) {
    return jest
        .spyOn(planMeter, "enforcedRow")
        .mockImplementation((_org: string, moduleId: string) =>
            Promise.resolve(
                planId === null
                    ? null
                    : fakePaymentsRow(
                          planId,
                          moduleId as "payments" | "subscriptions",
                      ),
            ),
        );
}

async function lockedBy(attempt: Promise<unknown>): Promise<unknown> {
    const err = await attempt.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse();
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    plans.create!.mockImplementation((args: { data: object }) =>
        Promise.resolve({ id: "plan_1", status: "ACTIVE", ...args.data }),
    );
    planIs(row());
});

describe("on a plan without memberships (made-up Free)", () => {
    beforeEach(() => onPlan("free"));

    it("refuses creating a plan: MODULE_LOCKED naming the row, nothing made", async () => {
        expect(await lockedBy(createPlanRow(ORG, actor, WHOLE))).toMatchObject({
            details: { code: "MODULE_LOCKED", moduleId: "subscriptions" },
        });
        expect(plans.create).not.toHaveBeenCalled();
        expect(tx.subscriptionPlanEvent!.create).not.toHaveBeenCalled();
    });

    it("refuses starting a draft", async () => {
        await lockedBy(createPlanDraft(ORG, actor, { name: "Weekly" }));
        expect(plans.create).not.toHaveBeenCalled();
    });

    it("refuses putting a draft on sale", async () => {
        planIs(row({ status: "DRAFT" }));
        await lockedBy(publishPlan(ORG, actor, "plan_1", 3));
        expect(plans.updateMany).not.toHaveBeenCalled();
        expect(tx.subscriptionPlanEvent!.create).not.toHaveBeenCalled();
    });

    it("refuses selling an archived plan again", async () => {
        planIs({ name: "Monthly", status: "ARCHIVED" });
        await lockedBy(setPlanStatusRow(ORG, actor, "plan_1", "ACTIVE"));
        expect(plans.updateMany).not.toHaveBeenCalled();
    });

    it("lets a plan be archived", async () => {
        planIs({ name: "Monthly", status: "ACTIVE" });
        await setPlanStatusRow(ORG, actor, "plan_1", "ARCHIVED");
        expect(plans.updateMany).toHaveBeenCalledWith({
            where: { id: "plan_1", organizationId: ORG },
            data: { status: "ARCHIVED" },
        });
    });

    it("lets a plan's wording change", async () => {
        planIs(row());
        await updatePlanRow(ORG, actor, "plan_1", {
            description: "Mornings only",
        });
        expect(plans.updateMany).toHaveBeenCalledWith({
            where: { id: "plan_1", organizationId: ORG },
            data: { description: "Mornings only" },
        });
    });

    it("lets a live plan's changed wording be published", async () => {
        planIs(row({ pendingChanges: { description: "Mornings only" } }));
        await publishPlan(ORG, actor, "plan_1", 3);
        expect(plans.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    description: "Mornings only",
                    status: "ACTIVE",
                }),
            }),
        );
    });
});

describe("on a plan with memberships (made-up Grow)", () => {
    beforeEach(() => onPlan("grow"));

    it("creates a plan, starts a draft and puts it on sale", async () => {
        await createPlanRow(ORG, actor, WHOLE);
        await createPlanDraft(ORG, actor, { name: "Weekly" });
        expect(plans.create).toHaveBeenCalledTimes(2);
        planIs(row({ status: "DRAFT" }));
        await publishPlan(ORG, actor, "plan_1", 3);
        expect(plans.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: "ACTIVE" }),
            }),
        );
    });

    it("sells an archived plan again", async () => {
        planIs({ name: "Monthly", status: "ARCHIVED" });
        await setPlanStatusRow(ORG, actor, "plan_1", "ACTIVE");
        expect(plans.updateMany).toHaveBeenCalledWith({
            where: { id: "plan_1", organizationId: ORG },
            data: { status: "ACTIVE" },
        });
    });
});

describe("with plan enforcement off", () => {
    it("asks nothing: create, draft, publish and sell again all go through", async () => {
        onPlan(null);
        await createPlanRow(ORG, actor, WHOLE);
        await createPlanDraft(ORG, actor, { name: "Weekly" });
        planIs(row({ status: "DRAFT" }));
        await publishPlan(ORG, actor, "plan_1", 3);
        planIs({ name: "Monthly", status: "ARCHIVED" });
        await setPlanStatusRow(ORG, actor, "plan_1", "ACTIVE");
        expect(plans.create).toHaveBeenCalledTimes(2);
        expect(plans.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ name: "Monthly" }),
            }),
        );
        expect(plans.updateMany).toHaveBeenCalledWith({
            where: { id: "plan_1", organizationId: ORG },
            data: { status: "ACTIVE" },
        });
    });
});
