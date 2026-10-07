// UX-041: a business hears its plan changed, once, in words read from the
// plan it is on when the notice runs.
const tx = {
    customerNotice: {
        createMany: jest.fn(),
        updateMany: jest.fn(),
    },
    notification: { create: jest.fn() },
};
jest.mock("@saroh/database", () => ({
    prisma: {
        entitlementOverride: { findFirst: jest.fn() },
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
}));
jest.mock("../bookings/staff-availability", () => ({
    businessTimezone: jest.fn().mockResolvedValue("Asia/Kolkata"),
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";

import type { CatalogueAccessService } from "./catalogue-access.service";
import {
    enqueuePlanChangeNotice,
    PLAN_CHANGE_NOTICE_TYPE,
    PlanChangeNoticeHandler,
    planChangeWords,
} from "./plan-change-notice.handler";

const overrideFind = prisma.entitlementOverride.findFirst as jest.Mock;

// Made-up plans: the words read names and order only, never a price.
const PLANS = [
    { id: "basic", name: "Basic" },
    { id: "plus", name: "Plus" },
] as unknown as Catalog["plans"];

const resolve = jest.fn();
const handler = new PlanChangeNoticeHandler({
    resolve,
} as unknown as CatalogueAccessService);

function on(planId: string, basePlanId = "basic") {
    resolve.mockResolvedValue({
        source: "catalogue",
        planId,
        basePlanId,
        catalog: { plans: PLANS },
    });
}

function job(payload: Record<string, unknown>): Job {
    return {
        id: "job_1",
        type: PLAN_CHANGE_NOTICE_TYPE,
        organizationId: "org_1",
        payload,
    } as unknown as Job;
}

beforeEach(() => {
    jest.clearAllMocks();
    tx.customerNotice.createMany.mockResolvedValue({ count: 1 });
    tx.notification.create.mockResolvedValue({ id: "ntf_1" });
    overrideFind.mockResolvedValue(null);
});

describe("the words", () => {
    it("up a plan, until a date: what's next", () => {
        expect(
            planChangeWords({
                plans: PLANS,
                toPlanId: "plus",
                fromPlanId: "basic",
                until: "31 Dec 2027",
                afterName: "Basic",
            }),
        ).toEqual({
            title: "You're on Plus until 31 Dec 2027",
            body: "Everything Plus comes with is yours to use now. After 31 Dec 2027 you're on Basic.",
        });
    });

    it("down a plan: what stays, and what waits", () => {
        expect(
            planChangeWords({
                plans: PLANS,
                toPlanId: "basic",
                fromPlanId: "plus",
                until: null,
                afterName: "Basic",
            }),
        ).toEqual({
            title: "You're on Basic now",
            body: "What you already have stays. Where Basic's limits are lower, adding more waits until you choose a plan with room.",
        });
    });
});

describe("the job", () => {
    it("a plan set until a date: one notice, claimed first", async () => {
        on("plus");
        overrideFind.mockResolvedValue({
            expiresAt: new Date("2027-12-31T10:00:00Z"),
            revokedAt: null,
        });
        await handler.handle(
            job({
                eventKey: "plan-change:ov_1:set",
                fromPlanId: "basic",
                overrideId: "ov_1",
                reason: "set",
            }),
        );
        expect(tx.customerNotice.createMany).toHaveBeenCalledWith({
            data: [
                {
                    organizationId: "org_1",
                    eventKey: "plan-change:ov_1:set",
                    kind: "PLAN_CHANGED",
                },
            ],
            skipDuplicates: true,
        });
        expect(tx.notification.create.mock.calls[0][0].data).toEqual({
            organizationId: "org_1",
            type: "plan.changed",
            title: "You're on Plus until 31 Dec 2027",
            body: "Everything Plus comes with is yours to use now. After 31 Dec 2027 you're on Basic.",
        });
    });

    it("its end date came: back on its own plan", async () => {
        on("basic");
        overrideFind.mockResolvedValue({
            expiresAt: new Date("2027-12-31T10:00:00Z"),
            revokedAt: null,
        });
        await handler.handle(
            job({
                eventKey: "plan-change:ov_1:ended",
                fromPlanId: "plus",
                overrideId: "ov_1",
                reason: "ended",
            }),
        );
        expect(tx.notification.create.mock.calls[0][0].data.title).toBe(
            "You're on Basic now",
        );
    });

    it("ended early: its date says nothing, ending it said so", async () => {
        on("basic");
        overrideFind.mockResolvedValue({
            expiresAt: new Date("2027-12-31T10:00:00Z"),
            revokedAt: new Date("2027-06-01T10:00:00Z"),
        });
        await handler.handle(
            job({
                eventKey: "plan-change:ov_1:ended",
                fromPlanId: "plus",
                overrideId: "ov_1",
                reason: "ended",
            }),
        );
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });

    it("a change that left the plan as it was says nothing", async () => {
        on("plus", "plus");
        await handler.handle(
            job({
                eventKey: "plan-change:ov_2:removed",
                fromPlanId: "plus",
                overrideId: "ov_2",
                reason: "removed",
            }),
        );
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });

    it("run twice, the business is told once", async () => {
        on("basic");
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        await handler.handle(
            job({
                eventKey: "plan-change:ov_2:removed",
                fromPlanId: "plus",
                overrideId: "ov_2",
                reason: "removed",
            }),
        );
        expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it("is queued on the change's own transaction", async () => {
        const create = jest.fn();
        const at = new Date("2027-12-31T10:01:00Z");
        await enqueuePlanChangeNotice(
            { job: { create } } as never,
            "org_1",
            {
                eventKey: "plan-change:ov_1:ended",
                fromPlanId: "plus",
                overrideId: "ov_1",
                reason: "ended",
            },
            at,
        );
        expect(create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: "plan.change.notice",
                payload: {
                    eventKey: "plan-change:ov_1:ended",
                    fromPlanId: "plus",
                    overrideId: "ov_1",
                    reason: "ended",
                },
                runAt: at,
            },
        });
    });
});
