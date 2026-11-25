/**
 * Product reviews' read routes (DEC-259): every review with the ratings,
 * and what Invite reviews offers. Each answers what its server read holds;
 * reviews go to a role that may read them while Sell is on, invites only to
 * one that may invite (`product-review:write` and `order:read`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<() => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        reviews: Fn;
        summary: Fn;
        invitable: Fn;
        setup: Fn;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        reviews: vi.fn<() => Promise<unknown>>(),
        summary: vi.fn<() => Promise<unknown>>(),
        invitable: vi.fn<() => Promise<unknown>>(),
        setup: vi.fn<() => Promise<unknown>>(),
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
vi.mock("@/lib/product-reviews/service", () => ({
    listReviews: () => h.reviews(),
    reviewSummary: () => h.summary(),
    invitableOrders: () => h.invitable(),
    reviewEmailSetup: () => h.setup(),
}));

import {
    productReviewsServer,
    reviewInvitesServer,
} from "@/lib/product-reviews/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import * as invitesRoute from "./invites/route";
import * as reviewsRoute from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["product-review:read", "product-review:write", "order:read"],
};
const MEMBER = {
    id: "org_a",
    role: "MEMBER",
    actions: ["product-review:read"],
};
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const REVIEW = {
    id: "r1",
    rating: 4,
    body: "Lovely",
    displayName: "Asha",
    productId: "p1",
    productName: "Rye",
    storeId: "s1",
    invitedTo: "asha@example.com",
    status: "PUBLISHED",
    reply: null,
    repliedAt: null,
    createdAt: "2026-11-20T10:00:00.000Z",
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    h.reviews.mockReset().mockResolvedValue([REVIEW]);
    h.summary
        .mockReset()
        .mockResolvedValue([{ productId: "p1", average: 4, count: 1 }]);
    h.invitable.mockReset().mockResolvedValue([]);
    h.setup.mockReset().mockResolvedValue({
        connected: false,
        canConnect: true,
        // Never crosses: the sheet says only the two above.
        providerKey: "secret-key",
    });
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    "/api/product-reviews": reviewsRoute.GET,
    "/api/product-reviews/invites": invitesRoute.GET,
};
const signedOut = { as: () => (as(null)(), (h.active = null)), status: 401 };
const elsewhere = {
    as: () => (as(OWNER)(), (h.active = "org_b")),
    status: 409,
};
const sellOff = {
    as: () => (as(OWNER)(), (h.modules = { state: "unavailable" })),
    status: 403,
};

describe("/api/product-reviews", () => {
    it("answers what the server read holds", async () => {
        await expectReadContract(
            productReviewsServer,
            reviewsRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(
            reviewInvitesServer,
            invitesRoute.GET,
            "org_a",
            {},
        );
    });

    it("reviews: to a role that reads them, while Sell is on", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "Sell off": sellOff,
                "signed out": signedOut,
                "another business open in this tab": elsewhere,
            },
            () =>
                reviewsRoute.GET(
                    readRequest("/api/product-reviews", { orgId: "org_a" }),
                ),
        );
    });

    it("invites: only to a role that may invite", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 403 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "Sell off": sellOff,
                "signed out": signedOut,
                "another business open in this tab": elsewhere,
            },
            () =>
                invitesRoute.GET(
                    readRequest("/api/product-reviews/invites", {
                        orgId: "org_a",
                    }),
                ),
        );
    });

    it("sends nothing of the email provider but whether it is connected", async () => {
        const res = await invitesRoute.GET(
            readRequest("/api/product-reviews/invites", { orgId: "org_a" }),
        );
        const body = JSON.stringify(await res.json());
        expect(body).not.toContain("secret-key");
        expect(body).toContain('"connected":false');
    });

    it("takes no params; a failed read is a 503, never an empty list; only GET", async () => {
        for (const [path, GET] of Object.entries(ROUTES)) {
            const res = await GET(
                readRequest(path, {
                    orgId: "org_a",
                    params: { status: "HIDDEN" },
                }),
            );
            expect(res.status, path).toBe(400);
        }
        expect(h.reviews).not.toHaveBeenCalled();
        h.reviews.mockRejectedValue(new Error("down"));
        const failed = await reviewsRoute.GET(
            readRequest("/api/product-reviews", { orgId: "org_a" }),
        );
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
        // The ratings failing only leaves the stars out.
        as(OWNER)();
        h.summary.mockRejectedValue(new Error("down"));
        const partial = await reviewsRoute.GET(
            readRequest("/api/product-reviews", { orgId: "org_a" }),
        );
        expect(await partial.json()).toEqual({
            reviews: [REVIEW],
            ratings: [],
        });
        expect((await reviewsRoute.POST()).status).toBe(405);
        expect((await invitesRoute.POST()).status).toBe(405);
    });
});
