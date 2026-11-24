/**
 * Home's read routes (DEC-259): the page's prefetch and the route answer
 * the same JSON, Home goes to anyone in the business (the API shapes it by
 * role) and "Finish setup" only to someone who may change the business, as
 * the page's own gate (`lib/home/access.ts`) decides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(
    (): {
        active: string | null;
        business: { id: string; actions?: string[] } | null;
        home: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
    } => ({ active: "org_a", business: null, home: vi.fn() }),
);
vi.mock("@/lib/api/http", () => ({
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/home/service", () => ({ getHome: () => h.home() }));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/organizations/settings-service", () => ({
    getOrganizationSettings: () => Promise.resolve({ id: "org_a" }),
}));
vi.mock("@/lib/settings/ready-service", () => ({
    loadReadyChecklist: () => Promise.resolve({ steps: [] }),
}));
vi.mock("@/lib/settings/ready", () => ({
    mayFinishSetup: (b: { actions?: string[] } | null) =>
        !!b?.actions?.includes("org:update"),
    firstSteps: () => ({ steps: [], shares: null }),
}));
vi.mock("@/lib/moments/service", () => ({
    getSeenMoments: () => Promise.resolve(null),
}));
vi.mock("@/lib/modules/service", () => ({
    listModules: () => Promise.resolve([]),
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    readWebAddressLinks: () => Promise.resolve(null),
}));

import { ApiError } from "@/lib/api/errors";
import { homeServer, homeSetupServer } from "@/lib/home/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as homeGET, POST } from "./route";
import { GET as setupGET } from "./setup/route";

const OWNER = { id: "org_a", actions: ["org:update", "order:read"] };
const MEMBER = { id: "org_a", actions: ["order:read"] };
const REVIEWER = { id: "org_a", actions: ["site:review"] };

const HOME = {
    view: "business",
    staff: null,
    actions: [{ code: "X", title: "Old", href: "/", severity: "LOW" }],
    hasAnyModule: true,
    upcoming: [],
    unavailable: [],
    needs: [],
    needsTotal: 0,
    ordersInProgress: 0,
    today: null,
    lastDay: null,
    week: {
        zone: "Asia/Kolkata",
        startDate: "2026-11-23",
        takings: [{ currency: "INR", amountMinor: 1 }],
        chequesWaiting: null,
    },
    tiles: null,
    needGroups: null,
    needGroupsTotal: 0,
    going: undefined,
};

const as =
    (who: typeof OWNER | null, home: () => unknown = () => HOME) =>
    () => {
        h.active = "org_a";
        h.business = who;
        h.home.mockReset();
        h.home.mockImplementation(() => Promise.resolve(home()));
    };

beforeEach(as(OWNER));

describe("/api/home", () => {
    it("answers what the page's prefetch holds, without what Home doesn't show", async () => {
        await expectReadContract(homeServer, homeGET, "org_a", {});
        const body = (await (
            await homeGET(readRequest("/api/home", { orgId: "org_a" }))
        ).json()) as { actions: unknown[]; week: Record<string, unknown> };
        expect(body.actions).toEqual([]);
        expect(Object.keys(body.week).sort()).toEqual([
            "chequesWaiting",
            "startDate",
            "zone",
        ]);
    });

    it("is the page's gate: anyone in the business, the API shaping it", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
                // The API sends a Reviewer only their review sites (F9).
                reviewer: {
                    as: as(REVIEWER, () => ({ ...HOME, view: "reviewer" })),
                    status: 200,
                },
                "signed out": {
                    as: as(null, () => {
                        throw new ApiError(401, "GET home");
                    }),
                    status: 401,
                },
                "no business": {
                    as: () => {
                        as(OWNER)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business's id": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => homeGET(readRequest("/api/home", { orgId: "org_a" })),
        );
    });

    it("an API refusal is the route's, generic; only GET answers", async () => {
        as(OWNER, () => {
            throw new ApiError(403, "GET home", "no");
        })();
        const res = await homeGET(readRequest("/api/home", { orgId: "org_a" }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "forbidden" });
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/home/setup", () => {
    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(homeSetupServer, setupGET, "org_a", {});
    });

    it("only for someone who may change the business, as the page", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 403 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business's id": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => setupGET(readRequest("/api/home/setup", { orgId: "org_a" })),
        );
    });
});
