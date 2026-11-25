/**
 * Discount codes' read routes (DEC-259): `/api/discounts` and
 * `/api/discounts/[discountId]` answer what their services give, as JSON,
 * behind the section's gate (Sell reachable); the API's no to a role is a
 * 403; the form's choices are read only for `discount:write`; a code
 * crosses with only what the screens draw; another business's code is a
 * 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({
    business: null as Business,
    commerce: "available",
    refused: false,
    discount: vi.fn<(id: string) => Promise<unknown>>(),
    reach: vi.fn(),
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve({ state: h.commerce }),
}));
const CODE = {
    id: "d1",
    code: "MARKETDAY",
    description: null,
    kind: "PERCENTAGE",
    percent: "10",
    amount: null,
    currency: null,
    appliesTo: "PRODUCT",
    targets: [{ id: "p1", name: "Mug", storeId: "s1" }],
    startsAt: null,
    endsAt: "2026-12-01T00:00:00.000Z",
    usageLimit: null,
    used: 2,
    state: "ACTIVE",
    // What the API sends beside the code, and no screen draws.
    organizationId: "org_a",
    createdById: "u1",
};
vi.mock("@/lib/discounts/service", () => ({
    listDiscounts: () => {
        // The API's 403 is `forbidden()`: Next's interrupt.
        if (h.refused) {
            throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), {
                digest: "NEXT_HTTP_ERROR_FALLBACK;403",
            });
        }
        return Promise.resolve([CODE]);
    },
    getDiscount: (id: string) => h.discount(id),
}));
vi.mock("@/lib/discounts/options", () => ({
    loadReachOptions: () => {
        h.reach();
        return Promise.resolve({
            options: { STOREFRONT: [], COLLECTION: [], PRODUCT: [] },
            defaultCurrency: "INR",
        });
    },
}));

import { discountServer, discountsListServer } from "@/lib/discounts/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as GET_ONE } from "./[discountId]/route";
import { GET, POST } from "./route";

const OWNER = { id: "org_a", role: "OWNER", actions: ["discount:write"] };
const READER = { id: "org_a", role: "MEMBER", actions: ["discount:read"] };

const as =
    (who: Business, commerce = "available", refused = false) =>
    () => {
        active.id = "org_a";
        h.business = who;
        h.commerce = commerce;
        h.refused = refused;
        h.discount.mockReset();
        h.discount.mockResolvedValue(CODE);
        h.reach.mockReset();
    };

const list = () => GET(readRequest("/api/discounts", { orgId: "org_a" }));
const one = (discountId: string) =>
    GET_ONE(readRequest(`/api/discounts/${discountId}`, { orgId: "org_a" }), {
        params: Promise.resolve({ discountId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/discounts", () => {
    it("answers what its service gives, as JSON", async () => {
        await expectReadContract(discountsListServer, GET, "org_a", {});
    });

    it("sends only what the screens draw of a code", async () => {
        const [code] = (await (await list()).json()) as Record<
            string,
            unknown
        >[];
        expect(code).not.toHaveProperty("organizationId");
        expect(code).not.toHaveProperty("createdById");
        expect(code.targets).toEqual([{ id: "p1", name: "Mug" }]);
    });

    it("is the section's gate; the API's no to the role is a 403", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "Sell off": { as: as(OWNER, "unavailable"), status: 403 },
                "a role without discounts": {
                    as: as(READER, "available", true),
                    status: 403,
                },
                "signed out": {
                    as: () => {
                        as(null)();
                        active.id = null;
                    },
                    status: 401,
                },
                "another business open in this tab": {
                    as: () => {
                        as(OWNER)();
                        active.id = "org_b";
                    },
                    status: 409,
                },
            },
            list,
        );
    });

    it("takes no params and only GET", async () => {
        const res = await GET(
            readRequest("/api/discounts", {
                orgId: "org_a",
                params: { a: "1" },
            }),
        );
        expect(res.status).toBe(400);
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/discounts/[discountId]", () => {
    it("answers what its service gives, as JSON", async () => {
        await expectReadContract(
            discountServer,
            (req) =>
                GET_ONE(req, { params: Promise.resolve({ discountId: "d1" }) }),
            "org_a",
            { discountId: "d1" },
        );
    });

    it("reads the form's choices only for discount:write", async () => {
        const body = (await (await one("d1")).json()) as { reach: unknown };
        expect(body.reach).toMatchObject({ defaultCurrency: "INR" });
        expect(h.reach).toHaveBeenCalledTimes(1);
        as(READER)();
        const read = (await (await one("d1")).json()) as { reach: unknown };
        expect(read.reach).toBeNull();
        expect(h.reach).not.toHaveBeenCalled();
    });

    it("another business's code, or none, is a 404", async () => {
        h.discount.mockResolvedValue(null);
        expect((await one("d2")).status).toBe(404);
    });

    it("refuses an id that isn't one", async () => {
        expect((await one("../x")).status).toBe(400);
        expect(h.discount).not.toHaveBeenCalled();
    });
});
