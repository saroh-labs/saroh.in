/**
 * One order's read route (DEC-259): the page's prefetch and the route
 * answer the same JSON; it has the Orders gate; another business's order
 * (or none) is a 404, never a 403. Money, the review invitation and "Add an
 * item" are read only for the roles that see them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        order: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
        payments: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
        review: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
        products: ReturnType<typeof vi.fn<(f: object) => Promise<unknown>>>;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        order: vi.fn<(id: string) => Promise<unknown>>(),
        payments: vi.fn<(id: string) => Promise<unknown>>(),
        review: vi.fn<(id: string) => Promise<unknown>>(),
        products: vi.fn<(f: object) => Promise<unknown>>(),
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
vi.mock("@/lib/orders/kitchen-service", () => ({
    getOrderRead: (id: string) => h.order(id),
    getAttentionAllergies: () => Promise.resolve([]),
    readOrderQuickView: vi.fn(),
}));
vi.mock("@/lib/orders/business-service", () => ({
    listOrderRows: vi.fn(),
    getOrderFilterOptions: vi.fn(),
}));
vi.mock("@/lib/stores/service", () => ({ listBusinessStores: vi.fn() }));
vi.mock("@/lib/payments/service", () => ({
    getOrderPayments: (id: string) => h.payments(id),
}));
vi.mock("@/lib/product-reviews/service", () => ({
    invitationState: (id: string) => h.review(id),
}));
vi.mock("@/lib/products/service", () => ({
    listProducts: (f: object) => h.products(f),
}));
vi.mock("@/lib/invoices/tax", () => ({
    getInvoiceBusiness: () => Promise.resolve(null),
}));

import { orderServer } from "@/lib/orders/access-server";
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
    actions: ["order:read", "order:stage", "order:edit"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["order:stage"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const ORDER = {
    id: "o1",
    orderId: "1042",
    store: { id: "s1", name: "Shop" },
    customer: null,
    attention: { entries: [] },
    money: { currency: "INR", total: "150.00" },
    next: { editable: true, stages: ["PREPARING"] },
    updatedAt: "2026-11-20T04:00:00.000Z",
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    h.order.mockReset();
    h.order.mockImplementation((id: string) =>
        // The API's read: another business's order is not found.
        Promise.resolve(
            id === "o1"
                ? who?.actions?.includes("order:read")
                    ? ORDER
                    : { ...ORDER, money: null }
                : null,
        ),
    );
    h.payments.mockReset();
    h.payments.mockResolvedValue({ attempts: [] });
    h.review.mockReset();
    h.review.mockResolvedValue({ status: "none" });
    h.products.mockReset();
    h.products.mockResolvedValue([]);
};

const get = (orderId: string, params: Record<string, string> = {}) =>
    GET(readRequest(`/api/orders/${orderId}`, { orgId: "org_a", params }), {
        params: Promise.resolve({ orderId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/orders/[orderId]", () => {
    it("answers what the page's prefetch holds", async () => {
        const client = makeTestClient();
        await prefetchRead(client, orderServer, "org_a", { orderId: "o1" });
        const res = await get("o1");
        expect(res.status).toBe(200);
        expect(await res.json()).toStrictEqual(
            client.getQueryData(
                orderServer.read.key("org_a", { orderId: "o1" }),
            ),
        );
        expect(h.products).toHaveBeenCalledWith({ storefront: "s1" });
    });

    it("reads money, the review and Add an item only for the roles that see them", async () => {
        as(MEMBER)();
        const body = (await (await get("o1")).json()) as Record<
            string,
            unknown
        >;
        expect(body).toMatchObject({
            payments: null,
            review: null,
            addable: null,
        });
        expect(h.payments).not.toHaveBeenCalled();
        expect(h.review).not.toHaveBeenCalled();
        expect(h.products).not.toHaveBeenCalled();
    });

    it("another business's order, or none, is a 404 with nothing in it", async () => {
        const res = await get("o_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("is the order page's gate: order:read or order:stage while Sell is on", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "member (the kitchen)": { as: as(MEMBER), status: 200 },
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
            () => get("o1"),
        );
    });

    it("takes the id from the path only; anything else is a 400 and reads nothing", async () => {
        expect((await get("o1", { orderId: "o2" })).status).toBe(400);
        expect((await get("o1", { view: "quick" })).status).toBe(400);
        expect((await get("../x")).status).toBe(400);
        expect(h.order).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});
