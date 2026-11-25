/**
 * Locations' read routes (DEC-259): the list of locations and one
 * location's page. The service and the route answer the same JSON; they go
 * to anyone in the open business, as the page asks only for the session
 * (the API decides what each role sees); another business's location is a
 * 404. Made-up names only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Fn = ReturnType<typeof vi.fn<(id?: string) => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: { id: string; role: string; actions?: string[] } | null;
        list: Fn;
        allowance: Fn;
        one: Fn;
        details: Fn;
        roster: Fn;
        selling: Fn;
        paused: Fn;
    } => ({
        active: "org_a",
        business: null,
        list: vi.fn<(id?: string) => Promise<unknown>>(),
        allowance: vi.fn<(id?: string) => Promise<unknown>>(),
        one: vi.fn<(id?: string) => Promise<unknown>>(),
        details: vi.fn<(id?: string) => Promise<unknown>>(),
        roster: vi.fn<(id?: string) => Promise<unknown>>(),
        selling: vi.fn<(id?: string) => Promise<unknown>>(),
        paused: vi.fn<(id?: string) => Promise<unknown>>(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/stores/storefronts", () => ({
    listStorefronts: () => h.list(),
    getStorefrontAllowance: () => h.allowance(),
    getStorefront: (id: string) => h.one(id),
}));
vi.mock("@/lib/stores/location-reads", () => ({
    readLocationDetails: (id: string) => h.details(id),
    readLocationRoster: (id: string) => h.roster(id),
}));
vi.mock("@/lib/stores/location-selling", () => ({
    readSiteSelling: () => h.selling(),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    pausedOrNull: () => h.paused(),
}));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import { locationServer, locationsServer } from "@/lib/stores/access";

import * as oneRoute from "./[storeId]/route";
import * as listRoute from "./route";

const OWNER = { id: "org_a", role: "OWNER", actions: ["store:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["store:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const HILL = {
    id: "st_hill",
    name: "Hill Road",
    orderCount: 3,
    kind: "SHOP",
    paused: false,
};
const SETTINGS = {
    ...HILL,
    currency: "INR",
    taxRate: "18.00",
    providers: [{ provider: "CASHFREE", status: "ACTIVE" }],
    pausedAt: null,
    // Dropped on both paths alike.
    stock: undefined,
};
const ROSTER = {
    members: [
        {
            userId: "u_1",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            role: "OWNER",
            kind: "owner",
        },
    ],
    invitations: [],
};

const as = (who: typeof OWNER | null) => () => {
    h.active = "org_a";
    h.business = who;
    for (const [fn, data] of [
        [h.list, [HILL]],
        [h.allowance, { used: 1, limit: 3 }],
        [h.one, SETTINGS],
        [h.details, { description: "Up the hill", logo: null }],
        [h.roster, ROSTER],
        [h.selling, { known: true, site: null }],
        [
            h.paused,
            {
                state: "paused",
                locations: [{ id: "st_old", name: "Old Road" }],
            },
        ],
    ] as const) {
        fn.mockReset();
        fn.mockImplementation(() => Promise.resolve(data));
    }
};

beforeEach(() => as(OWNER)());

const segment = (storeId: string) => ({
    params: Promise.resolve({ storeId }),
});

describe("/api/locations", () => {
    it("answers what the service holds, with only what the screen draws", async () => {
        await expectReadContract(locationsServer, listRoute.GET, "org_a", {});
        const res = await listRoute.GET(
            readRequest("/api/locations", { orgId: "org_a" }),
        );
        const body = (await res.json()) as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual([
            "limit",
            "notTakingOrders",
            "site",
            "storefronts",
        ]);
        expect(body.limit).toBe(3);
        expect(body.notTakingOrders).toEqual(["st_old"]);
        // A website that couldn't be read is no line, never "in person only".
        h.selling.mockImplementation(() => Promise.resolve({ known: false }));
        const unknown = await listRoute.GET(
            readRequest("/api/locations", { orgId: "org_a" }),
        );
        expect("site" in ((await unknown.json()) as object)).toBe(false);
    });

    it("an allowance that can't be read offers New: null, not a failure", async () => {
        h.allowance.mockImplementation(() => Promise.reject(new Error("x")));
        const res = await listRoute.GET(
            readRequest("/api/locations", { orgId: "org_a" }),
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as { limit: unknown }).limit).toBeNull();
    });

    it("a list that fails is a generic failure, never an empty list; only GET answers", async () => {
        h.list.mockImplementation(() => Promise.reject(new Error("down")));
        const res = await listRoute.GET(
            readRequest("/api/locations", { orgId: "org_a" }),
        );
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
        expect((await listRoute.POST()).status).toBe(405);
        const extra = await listRoute.GET(
            readRequest("/api/locations", {
                orgId: "org_a",
                params: { storefront: "st_hill" },
            }),
        );
        expect(extra.status).toBe(400);
    });
});

describe("/api/locations/[storeId]", () => {
    it("answers what the service holds: settings, details and roster", async () => {
        await expectReadContract(
            locationServer,
            oneRoute.GET,
            "org_a",
            { storeId: "st_hill" },
            { storeId: "st_hill" },
        );
        const res = await oneRoute.GET(
            readRequest("/api/locations/st_hill", { orgId: "org_a" }),
            segment("st_hill"),
        );
        expect(res.status).toBe(200);
        expect(h.one).toHaveBeenLastCalledWith("st_hill");
        const text = await res.text();
        // Nothing of a provider's credentials crosses, only its name and state.
        expect(text).not.toMatch(/secret|token|apiKey|password/i);
    });

    it("another business's location is a 404; a bad id a 400 that reads nothing", async () => {
        h.one.mockImplementation(() => Promise.resolve(null));
        const other = await oneRoute.GET(
            readRequest("/api/locations/st_theirs", { orgId: "org_a" }),
            segment("st_theirs"),
        );
        expect(other.status).toBe(404);
        expect(await other.json()).toEqual({ code: "not_found" });
        h.one.mockClear();
        const bad = await oneRoute.GET(
            readRequest("/api/locations/x", { orgId: "org_a" }),
            segment("../stores"),
        );
        expect(bad.status).toBe(400);
        expect(h.one).not.toHaveBeenCalled();
    });

    it("a roster or details that fail don't fail the location", async () => {
        h.roster.mockImplementation(() => Promise.resolve(null));
        h.details.mockImplementation(() => Promise.resolve(undefined));
        const res = await oneRoute.GET(
            readRequest("/api/locations/st_hill", { orgId: "org_a" }),
            segment("st_hill"),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ roster: null });
    });
});

describe("who may read Locations", () => {
    it("is the page's gate on both routes: anyone in the open business", async () => {
        const calls = [
            () =>
                listRoute.GET(
                    readRequest("/api/locations", { orgId: "org_a" }),
                ),
            () =>
                oneRoute.GET(
                    readRequest("/api/locations/st_hill", { orgId: "org_a" }),
                    segment("st_hill"),
                ),
        ];
        for (const call of calls) {
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: 200 },
                    member: { as: as(MEMBER), status: 200 },
                    // The API decides what a Reviewer is shown, as on the page.
                    reviewer: { as: as(REVIEWER), status: 200 },
                    "not in the business": { as: as(null), status: 403 },
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
                call,
            );
        }
    });
});
