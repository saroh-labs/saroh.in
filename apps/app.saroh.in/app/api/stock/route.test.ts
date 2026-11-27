/**
 * Stock's read routes (DEC-259): levels, the log (with the screen's
 * product names) and the checks. The page's prefetch and each route answer
 * the same JSON for what the address asks; they go to whoever may open Products while
 * Sell is on (reading stock is reading the catalogue), and to nobody else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<(f?: object) => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        levels: Fn;
        log: Fn;
        checks: Fn;
        products: Fn;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        levels: vi.fn<(f?: object) => Promise<unknown>>(),
        log: vi.fn<(f?: object) => Promise<unknown>>(),
        checks: vi.fn<(f?: object) => Promise<unknown>>(),
        products: vi.fn<(f?: object) => Promise<unknown>>(),
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
vi.mock("@/lib/stock/service", () => ({
    getStockLevels: (f?: object) => h.levels(f),
    getStockLog: (f?: object) => h.log(f),
    getStockChecks: (f?: object) => h.checks(f),
    stockTrackingOnce: vi.fn(),
}));
vi.mock("@/lib/products/service", () => ({
    listProducts: () => h.products(),
    listCataloguePage: vi.fn(),
}));
vi.mock("@/lib/products/overview", () => ({
    getProductOverview: vi.fn(),
    withStorefrontFallback: vi.fn(),
}));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import {
    stockChecksServer,
    stockLevelsServer,
    stockLogServer,
} from "@/lib/stock/access";
import { stockView } from "@/lib/stock/queries";

import * as checksRoute from "./checks/route";
import * as logRoute from "./log/route";
import * as levelsRoute from "./route";

const OWNER = { id: "org_a", role: "OWNER", actions: ["store:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["store:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const LEVELS = {
    storefronts: [{ id: "s1", name: "Hill Road" }],
    rows: [],
    untracked: [],
    tracking: true,
    canWrite: true,
    total: 0,
    needsYou: 0,
    // Dropped on both paths alike.
    timezone: undefined,
};
const LOG = {
    entries: [],
    nextCursor: null,
    seesPeople: true,
    seesOrders: true,
};
const CHECKS = {
    checks: [],
    counts: {
        SHORT: 0,
        COUNT_MISMATCH: 0,
        SALE_NOT_TAKEN: 0,
        PROMISED_MISMATCH: 0,
    },
    canResolve: true,
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    for (const [fn, data] of [
        [h.levels, LEVELS],
        [h.log, LOG],
        [h.checks, CHECKS],
        [h.products, [{ id: "p1", name: "Rye", status: "PUBLISHED" }]],
    ] as const) {
        fn.mockReset();
        fn.mockImplementation(() => Promise.resolve(data));
    }
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    "/api/stock": levelsRoute.GET,
    "/api/stock/log": logRoute.GET,
    "/api/stock/checks": checksRoute.GET,
};

describe("Stock opens on what needs you (DEC-266)", () => {
    const levelsOf = (params: Record<string, string>) =>
        stockView(params, { levels: 50 }, [{ id: "s1" }]).levels;

    it("asks for Needs you while anything needs you, out first, when nothing is chosen", () => {
        expect(levelsOf({})).toMatchObject({ needs: "auto", sort: "need" });
        // A search looks through everything.
        expect(levelsOf({ q: "rye" }).needs).toBeUndefined();
    });

    it("lets the address win: Everything, Needs you, or one location", () => {
        expect(levelsOf({ show: "all" }).needs).toBeUndefined();
        expect(levelsOf({ show: "needs" }).needs).toBe("1");
        expect(levelsOf({ show: "s1" })).toMatchObject({
            storefront: "s1",
            needs: undefined,
        });
    });
});

describe("/api/stock/*", () => {
    it("answers what the page's prefetch holds, for what the address asks", async () => {
        const view = stockView(
            {
                tab: "log",
                show: "s1",
                q: "rye",
                kind: "wasted",
                store: "s1",
                date: "custom",
                from: "2026-11-01",
                to: "2026-11-07",
                logPage: "2",
                checksSize: "25",
            },
            { levels: 50, log: 25, checks: 50 },
            [{ id: "s1" }],
        );
        await expectReadContract(
            stockLevelsServer,
            levelsRoute.GET,
            "org_a",
            view.levels,
            { storefront: "s1", q: "rye", page: "1", size: "50" },
        );
        expect(h.levels).toHaveBeenLastCalledWith({
            storefront: "s1",
            q: "rye",
            page: 1,
            size: 50,
            needs: false,
        });
        await expectReadContract(
            stockLogServer,
            logRoute.GET,
            "org_a",
            view.log,
            {
                kind: "wasted",
                storefront: "s1",
                date: "custom",
                from: "2026-11-01",
                to: "2026-11-07",
                page: "2",
                size: "25",
                names: "1",
            },
        );
        // The kind and the custom days reach the API as the page asked.
        expect(h.log).toHaveBeenLastCalledWith(
            expect.objectContaining({
                kind: ["WASTED"],
                storefront: "s1",
                from: "2026-11-01",
                to: "2026-11-07",
                page: 2,
                size: 25,
            }),
        );
        await expectReadContract(
            stockChecksServer,
            checksRoute.GET,
            "org_a",
            view.checks,
            { page: "1", size: "25" },
        );
        // The screen's log carries its Product filter: names only, nothing
        // else of the catalogue crosses.
        const log = await logRoute.GET(
            readRequest("/api/stock/log", {
                orgId: "org_a",
                params: { names: "1" },
            }),
        );
        expect(((await log.json()) as { products: unknown }).products).toEqual([
            { id: "p1", name: "Rye" },
        ]);
    });

    it("is the section's gate on every route: store:read while Sell is on", async () => {
        for (const [path, GET] of Object.entries(ROUTES)) {
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
                () => GET(readRequest(path, { orgId: "org_a" })),
            );
        }
    });

    it("takes only each read's params, bounded; anything else is a 400 and reads nothing", async () => {
        const bad: [keyof typeof ROUTES, Record<string, string>][] = [
            ["/api/stock", { size: "500" }],
            ["/api/stock", { needs: "true" }],
            ["/api/stock", { q: "x".repeat(101) }],
            ["/api/stock", { product: "p1" }],
            ["/api/stock/log", { from: "yesterday" }],
            ["/api/stock/log", { limit: "1000" }],
            ["/api/stock/log", { cursor: "abc" }],
            ["/api/stock/checks", { limit: "1" }],
            ["/api/stock/log", { names: "true" }],
        ];
        for (const [path, params] of bad) {
            const res = await ROUTES[path](
                readRequest(path, { orgId: "org_a", params }),
            );
            expect(res.status, `${path} ${JSON.stringify(params)}`).toBe(400);
        }
        for (const fn of [h.levels, h.log, h.checks, h.products]) {
            expect(fn).not.toHaveBeenCalled();
        }
    });

    it("a read that fails is a generic failure, never an empty list; no business is a 404; only GET answers", async () => {
        h.log.mockImplementation(() => Promise.reject(new Error("down")));
        const failed = await logRoute.GET(
            readRequest("/api/stock/log", { orgId: "org_a" }),
        );
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
        h.levels.mockImplementation(() => Promise.resolve(null));
        const none = await levelsRoute.GET(
            readRequest("/api/stock", { orgId: "org_a" }),
        );
        expect(none.status).toBe(404);
        expect((await levelsRoute.POST()).status).toBe(405);
    });
});
