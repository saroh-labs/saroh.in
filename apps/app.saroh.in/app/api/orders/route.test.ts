/**
 * The Orders list's read routes (DEC-259): the list, what its filter bar
 * offers, and Print tickets. The page's prefetch and each route answer the
 * same JSON; they go to whoever reaches Orders (`order:read`, or
 * `order:stage` alone for the kitchen) while Sell is on. What each row
 * shows (money, a location team's own orders) is the API's: the route asks
 * with the person's session and adds nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = {
    id: string;
    role: string;
    roleKey?: string;
    actions?: string[];
} | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        list: ReturnType<typeof vi.fn<(p: object) => Promise<unknown>>>;
        filters: ReturnType<typeof vi.fn<(p?: string) => Promise<unknown>>>;
        stores: { id: string; name: string }[];
        quick: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        list: vi.fn<(p: object) => Promise<unknown>>(),
        filters: vi.fn<(p?: string) => Promise<unknown>>(),
        stores: [],
        quick: vi.fn<(id: string) => Promise<unknown>>(),
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
vi.mock("@/lib/orders/business-service", () => ({
    listOrderRows: (p: object) => h.list(p),
    getOrderFilterOptions: (p?: string) => h.filters(p),
}));
vi.mock("@/lib/stores/service", () => ({
    listBusinessStores: () => Promise.resolve(h.stores),
}));
vi.mock("@/lib/orders/kitchen-service", () => ({
    getOrderRead: vi.fn(),
    getAttentionAllergies: vi.fn(),
    readOrderQuickView: (id: string) => h.quick(id),
}));
vi.mock("@/lib/payments/service", () => ({ getOrderPayments: vi.fn() }));
vi.mock("@/lib/product-reviews/service", () => ({ invitationState: vi.fn() }));
vi.mock("@/lib/products/service", () => ({ listProducts: vi.fn() }));
vi.mock("@/lib/invoices/tax", () => ({ getInvoiceBusiness: vi.fn() }));

import {
    ordersListServer,
    ordersOptionsServer,
    ticketsServer,
} from "@/lib/orders/access-server";
import { readOrdersQuery } from "@/lib/orders/list-query";
import { ordersAsk } from "@/lib/orders/queries";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as OPTIONS_GET } from "./options/route";
import { GET, POST } from "./route";
import { GET as TICKETS_GET } from "./tickets/route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["order:read", "order:stage", "order:edit"],
};
// The kitchen (DEC-024): steps, no money.
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["order:stage"] };
// A location's team (DEC-074): the API answers with its locations' orders.
const LOCATION = {
    id: "org_a",
    role: "MEMBER",
    roleKey: "LOCATION_MANAGER",
    actions: ["order:stage"],
};
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const PAGE = {
    rows: [
        {
            id: "o1",
            orderId: "1042",
            placedAt: "2026-11-20T04:00:00.000Z",
            total: undefined,
        },
    ],
    counts: { all: 1, open: 1, refunded: 0 },
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    h.stores = [];
    h.list.mockReset();
    h.list.mockResolvedValue(PAGE);
    h.filters.mockReset();
    h.filters.mockResolvedValue({ types: [], steps: [], product: null });
    h.quick.mockReset();
    h.quick.mockImplementation((id: string) =>
        Promise.resolve(
            id === "o1"
                ? {
                      ok: true,
                      order: {
                          id: "o1",
                          ticketName: "Asha",
                          createdAt: "2026-11-20T04:00:00.000Z",
                      },
                  }
                : { ok: false, reason: "gone" },
        ),
    );
};

const list = (params: Record<string, string> = {}) =>
    GET(readRequest("/api/orders", { orgId: "org_a", params }));

beforeEach(() => as(OWNER)());

describe("/api/orders", () => {
    it("answers what the page's prefetch holds, for the address's view", async () => {
        const ask = ordersAsk(
            readOrdersQuery({ tab: "open", page: "2", payment: "unpaid" }),
        );
        expect(ask).toEqual({ tab: "open", page: "2", payment: "unpaid" });
        await expectReadContract(ordersListServer, GET, "org_a", ask, ask);
        // The API is asked the page the address names, nothing wider.
        expect(h.list).toHaveBeenLastCalledWith(
            expect.objectContaining({
                tab: "open",
                page: 2,
                payment: "UNPAID",
            }),
        );
    });

    it("is the list's gate: order:read or order:stage while Sell is on", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "member (the kitchen)": { as: as(MEMBER), status: 200 },
                "location team": { as: as(LOCATION), status: 200 },
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
            () => list(),
        );
    });

    it("a location team sees what the API gives its locations, with no store named for it", async () => {
        as(LOCATION)();
        const scoped = { ...PAGE, counts: { all: 1, open: 1, refunded: 0 } };
        h.list.mockResolvedValue(scoped);
        const res = await list();
        expect(await res.json()).toEqual(scoped);
        // The route never widens or narrows the person's scope itself.
        expect(h.list.mock.calls[0]?.[0]).toMatchObject({ storeId: undefined });
    });

    it("refuses an unknown param, and every method but GET", async () => {
        expect((await list({ organizationId: "org_b" })).status).toBe(400);
        expect((await list({ q: "a".repeat(101) })).status).toBe(400);
        expect(h.list).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/orders/options", () => {
    it("is keyed on the product alone, and counts open orders per storefront", async () => {
        h.stores = [
            { id: "s1", name: "Shop" },
            { id: "s2", name: "Online" },
        ];
        h.list.mockImplementation((p: object) =>
            Promise.resolve({
                ...PAGE,
                counts: {
                    all: 9,
                    open: (p as { storeId: string }).storeId === "s1" ? 3 : 1,
                    refunded: 0,
                },
            }),
        );
        await expectReadContract(
            ordersOptionsServer,
            OPTIONS_GET,
            "org_a",
            { product: "p1" },
            { product: "p1" },
        );
        const body = (await (
            await OPTIONS_GET(
                readRequest("/api/orders/options", { orgId: "org_a" }),
            )
        ).json()) as { openByStore: unknown };
        expect(body.openByStore).toEqual({ s1: 3, s2: 1 });
        expect(h.filters).toHaveBeenLastCalledWith(undefined);
        expect(
            (
                await OPTIONS_GET(
                    readRequest("/api/orders/options", {
                        orgId: "org_a",
                        params: { tab: "open" },
                    }),
                )
            ).status,
        ).toBe(400);
    });

    it("has the list's gate", async () => {
        as(REVIEWER)();
        const res = await OPTIONS_GET(
            readRequest("/api/orders/options", { orgId: "org_a" }),
        );
        expect(res.status).toBe(403);
        expect(h.filters).not.toHaveBeenCalled();
    });
});

describe("/api/orders/tickets", () => {
    it("reads each picked order as the quick view does; one that can't be read is counted", async () => {
        const ask = { ids: "o1,o_gone" };
        await expectReadContract(ticketsServer, TICKETS_GET, "org_a", ask, ask);
        const body = (await (
            await TICKETS_GET(
                readRequest("/api/orders/tickets", {
                    orgId: "org_a",
                    params: ask,
                }),
            )
        ).json()) as { orders: { id: string }[]; failed: number };
        expect(body.orders.map((o) => o.id)).toEqual(["o1"]);
        expect(body.failed).toBe(1);
    });

    it("takes 50 order ids, and has the list's gate", async () => {
        const ids = Array.from(
            { length: 50 },
            (_, i) => `cmwuo0cgx0025bnsg0lq9w${String(i).padStart(3, "0")}`,
        ).join(",");
        const res = await TICKETS_GET(
            readRequest("/api/orders/tickets", {
                orgId: "org_a",
                params: { ids },
            }),
        );
        expect(res.status).toBe(200);
        as(REVIEWER)();
        const denied = await TICKETS_GET(
            readRequest("/api/orders/tickets", {
                orgId: "org_a",
                params: { ids: "o1" },
            }),
        );
        expect(denied.status).toBe(403);
        expect(h.quick).not.toHaveBeenCalled();
    });
});
