/**
 * The Products list's read route (DEC-259): the page's prefetch and the
 * route answer the same JSON for the address's filter; it goes to whoever
 * may open Products while Sell is on, and to nobody else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        list: ReturnType<typeof vi.fn<(f: object) => Promise<unknown>>>;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        list: vi.fn<(f: object) => Promise<unknown>>(),
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
vi.mock("@/lib/products/service", () => ({
    listCataloguePage: (f: object) => h.list(f),
}));
vi.mock("@/lib/products/overview", () => ({
    getProductOverview: vi.fn(),
    withStorefrontFallback: vi.fn(),
}));
vi.mock("@/lib/stock/service", () => ({
    getStockLevels: vi.fn(),
    stockTrackingOnce: vi.fn(),
}));

import { productsListServer } from "@/lib/products/access";
import { catalogueProduct } from "@/lib/products/catalogue.fixture";
import { catalogueFilter, readListQuery } from "@/lib/products/list-query";
import type { CataloguePage } from "@/lib/products/service";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = { id: "org_a", role: "OWNER", actions: ["store:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["store:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const PAGE: CataloguePage = {
    items: [catalogueProduct({ id: "a" })],
    nextCursor: null,
    total: 1,
    pageSize: 50,
    counts: { all: 1, collections: 0, inventory: 1 },
    storefronts: { everywhere: 1, byStorefront: [] },
    needs: [],
};

const as =
    (who: Business, read: () => unknown = () => PAGE) =>
    () => {
        h.active = "org_a";
        h.business = who;
        h.modules = { state: "available" };
        h.list.mockReset();
        h.list.mockImplementation(() => Promise.resolve(read()));
    };

const get = (params: Record<string, string> = {}) =>
    GET(readRequest("/api/products", { orgId: "org_a", params }));

beforeEach(() => as(OWNER)());

describe("/api/products", () => {
    it("answers what the page's prefetch holds, for the filter the address names", async () => {
        const filter = catalogueFilter(
            readListQuery({ status: "PUBLISHED", q: "rye", page: "2" }, 25),
        );
        await expectReadContract(productsListServer, GET, "org_a", filter, {
            status: "PUBLISHED",
            q: "rye",
            page: "2",
            size: "25",
        });
        expect(h.list).toHaveBeenLastCalledWith({
            status: "PUBLISHED",
            q: "rye",
            page: 2,
            size: 25,
        });
    });

    it("is the section's gate: store:read while Sell is on", async () => {
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
            () => get(),
        );
    });

    it("takes only the list's filters, bounded; anything else is a 400 and reads nothing", async () => {
        const bad: Record<string, string>[] = [
            { size: "500" },
            { status: "SOLD" },
            { sort: "random" },
            { q: "x".repeat(101) },
            { cursor: "abc" },
            { limit: "1000" },
        ];
        for (const params of bad) {
            expect((await get(params)).status).toBe(400);
        }
        expect(h.list).not.toHaveBeenCalled();
    });

    it("a list that can't be read is a generic failure, never an empty list; only GET answers", async () => {
        as(OWNER, () => {
            throw new Error("down");
        })();
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
        expect((await POST()).status).toBe(405);
    });
});
