/**
 * One product's read route (DEC-259): the page's prefetch and the route
 * answer the same JSON; it goes to whoever may open Products while Sell is
 * on; another business's product (or none) is a 404, never a 403.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        overview: ReturnType<
            typeof vi.fn<
                (at: string | undefined, id: string) => Promise<unknown>
            >
        >;
        levels: ReturnType<typeof vi.fn<(f: object) => Promise<unknown>>>;
        tracking: { tracked: boolean } | null;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        overview:
            vi.fn<(at: string | undefined, id: string) => Promise<unknown>>(),
        levels: vi.fn<(f: object) => Promise<unknown>>(),
        tracking: { tracked: true },
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve(h.modules),
}));
vi.mock("@/lib/products/overview", () => ({
    getProductOverview: (at: string | undefined, id: string) =>
        h.overview(at, id),
    withStorefrontFallback: async (
        at: string | undefined,
        read: (s: string | undefined) => Promise<unknown>,
    ) => (await read(at)) ?? (at ? read(undefined) : null),
}));
vi.mock("@/lib/products/service", () => ({ listCataloguePage: vi.fn() }));
vi.mock("@/lib/stock/service", () => ({
    getStockLevels: (f: object) => h.levels(f),
    stockTrackingOnce: () => Promise.resolve(h.tracking),
}));

import { productServer } from "@/lib/products/access";
import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["store:read", "store:write"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["store:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const OVERVIEW = {
    product: {
        id: "p1",
        name: "Rye",
        status: "PUBLISHED",
        stockTracked: true,
        archivedAt: undefined,
        createdAt: "2026-10-19T04:00:00.000Z",
    },
    storefront: { id: "s1", name: "Shop" },
};
const LEVELS = {
    storefronts: [{ id: "s1", name: "Shop" }],
    rows: [
        {
            productId: "p1",
            variantId: null,
            title: "Rye",
            cells: [
                {
                    storeId: "s1",
                    soldHere: true,
                    onHand: 4,
                    promised: 1,
                    canSell: 3,
                    warnAt: null,
                },
            ],
        },
    ],
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    h.tracking = { tracked: true };
    h.overview.mockReset();
    h.overview.mockImplementation((_at, id: string) =>
        Promise.resolve(id === "p1" ? OVERVIEW : null),
    );
    h.levels.mockReset();
    h.levels.mockResolvedValue(LEVELS);
};

const get = (productId: string, params: Record<string, string> = {}) =>
    GET(readRequest(`/api/products/${productId}`, { orgId: "org_a", params }), {
        params: Promise.resolve({ productId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/products/[productId]", () => {
    it("answers what the page's prefetch holds, the shelves only when asked", async () => {
        const client = makeTestClient();
        const ask = {
            productId: "p1",
            storefront: "s1",
            shelves: "1" as const,
        };
        await prefetchRead(client, productServer, "org_a", ask);
        const res = await get("p1", { storefront: "s1", shelves: "1" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { stock: unknown };
        expect(body).toStrictEqual(
            client.getQueryData(productServer.read.key("org_a", ask)),
        );
        expect(body.stock).not.toBeNull();
        expect(h.overview).toHaveBeenCalledWith("s1", "p1");

        h.levels.mockClear();
        const bare = (await (await get("p1")).json()) as { stock: unknown };
        expect(bare.stock).toBeNull();
        expect(h.levels).not.toHaveBeenCalled();
    });

    it("reads no shelves for a product whose stock isn't counted", async () => {
        h.tracking = { tracked: false };
        const body = (await (await get("p1", { shelves: "1" })).json()) as {
            stock: unknown;
        };
        expect(body.stock).toBeNull();
        expect(h.levels).not.toHaveBeenCalled();
    });

    it("another business's product, or none, is a 404 with nothing in it", async () => {
        const res = await get("p_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("is the product page's gate: store:read while Sell is on", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "Sell off": {
                    as: () => {
                        as(OWNER)();
                        h.modules = { state: "unavailable" };
                    },
                    status: 403,
                },
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
            () => get("p1"),
        );
    });

    it("takes the id from the path only; anything else is a 400 and reads nothing", async () => {
        const bad: Record<string, string>[] = [
            { productId: "p1" },
            { shelves: "yes" },
            { tab: "stock" },
        ];
        for (const params of bad) {
            expect((await get("p1", params)).status).toBe(400);
        }
        expect((await get("../x")).status).toBe(400);
        expect(h.overview).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});
