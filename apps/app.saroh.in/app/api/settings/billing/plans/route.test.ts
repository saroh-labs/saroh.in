/**
 * Change plan's read route (DEC-259, U18): the plans' cards to whoever may
 * open the plan (`billing:read`), and a payment still waiting only to whoever
 * may change it (`billing:manage`). Not there while plans aren't shown.
 * Made-up plans and prices.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
    active: "org_a" as string | null, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    business: null as unknown, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    plansOpen: true,
    checkouts: null as unknown, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    access: { status: "ok", data: null } as unknown, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_PLANS: "on" } }));
vi.mock("@/lib/saroh-billing/service", () => ({
    plansOpen: () => Promise.resolve(h.plansOpen),
    getSarohSubscription: () =>
        Promise.resolve({ status: "ok", subscription: null }),
    getBillingAccess: () => Promise.resolve(h.access),
    livePricing: () => Promise.resolve(null),
    getCheckouts: () => Promise.resolve({ status: "ok", data: h.checkouts }),
    quotePlan: () => Promise.resolve(null),
}));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import { plansServer } from "@/lib/saroh-billing/screen-service";

import * as route from "./route";

const biz = (role: string, actions: string[]) => ({
    id: "org_a",
    name: "Rye",
    role,
    actions,
});
const OWNER = biz("OWNER", ["billing:read", "billing:manage"]);
const ADMIN = biz("ADMIN", ["billing:read"]);
const MEMBER = biz("MEMBER", ["org:read"]);

const OPEN = {
    id: "co_1",
    kind: "CHANGE",
    status: "OPEN",
    plan: { id: "plan_c", name: "Plan C", version: 1 },
    cycle: "month",
    expiresAt: "2031-04-01T00:00:00.000Z",
    handoff: {
        provider: "RAZORPAY",
        keyId: "rzp_test_public",
        subscriptionId: "sub_x",
        orderId: null,
        amountPaise: 100,
        currency: "INR",
        prefill: { name: null, email: null, contact: null },
    },
};

const as = (who: unknown) => () => {
    h.active = "org_a";
    h.business = who;
    h.plansOpen = true;
    h.checkouts = { open: OPEN, scheduled: null };
    h.access = { status: "ok", data: null };
};
const get = () =>
    route.GET(readRequest("/api/settings/billing/plans", { orgId: "org_a" }));

beforeEach(() => as(OWNER)());

describe("Change plan's read route", () => {
    it("answers what its service reads", async () => {
        await expectReadContract(plansServer, route.GET, "org_a", {});
    });

    it("is billing:read's: the owner and an Admin, nobody else", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                admin: { as: as(ADMIN), status: 200 },
                member: { as: as(MEMBER), status: 403 },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business open in this tab": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            get,
        );
    });

    it("sends a waiting payment to the owner only, and nothing of the subscription", async () => {
        const owner = (await (await get()).json()) as Record<string, unknown>;
        expect(Object.keys(owner).sort()).toEqual(
            [
                "currentPlan",
                "cycle",
                "kind",
                "pending",
                "rows",
                "yearly",
            ].sort(),
        );
        expect(owner.pending).toEqual({
            planName: "Plan C",
            expiresAt: OPEN.expiresAt,
            handoff: OPEN.handoff,
        });
        as(ADMIN)();
        const admin = (await (await get()).json()) as Record<string, unknown>;
        expect(admin.pending).toBeNull();
        expect(JSON.stringify(admin)).not.toContain("rzp_");
    });

    it("is not found while plans aren't shown, and says the API's refusal", async () => {
        h.plansOpen = false;
        // The gate asks the switch too: no plan to read.
        expect((await get()).status).toBe(403);
        as(OWNER)();
        h.access = { status: "denied" };
        expect(await (await get()).json()).toEqual({ kind: "denied" });
        h.plansOpen = false;
        expect(await plansServer.service({})).toBeNull();
    });

    it("takes no params; only GET answers", async () => {
        const res = await route.GET(
            readRequest("/api/settings/billing/plans", {
                orgId: "org_a",
                params: { plan: "c" },
            }),
        );
        expect(res.status).toBe(400);
        expect((await route.POST()).status).toBe(405);
    });
});
