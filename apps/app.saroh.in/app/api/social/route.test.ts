/**
 * Social's read routes (DEC-259): Saroh Social's screen, one post, and the
 * free Share's What's worth posting and Your posts. Each service and its
 * route answer the same JSON; they go to whoever may open Social
 * (`social:read` while Share is on), and to nobody else. A channel crosses
 * as display facts only: no token, Page token, app secret or signed
 * request reaches the route's JSON or the browser's cache, whatever the
 * API sends (KTD-6d).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        shareOn: boolean;
        access: Fn;
        channels: Fn;
        posts: Fn;
        post: Fn;
        own: Fn;
        picks: Fn;
    } => ({
        active: "org_a",
        business: null,
        shareOn: true,
        access: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
        channels: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
        posts: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
        post: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
        own: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
        picks: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
    orgBase: () => Promise.resolve(h.active && `/organizations/${h.active}`),
    getJson: (path: string) =>
        path.endsWith("/share-posts")
            ? h.own()
            : Promise.reject(new Error(path)),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/share-item/share-posts-switch", () => ({
    sharePostsOn: () => h.shareOn,
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    readWebAddressLinks: () =>
        Promise.resolve({
            origin: "https://northwind.example.com",
            address: "northwind",
            links: { site: "/", shop: "/shop", book: "/book" },
        }),
}));
vi.mock("@/lib/sites/service", () => ({
    listSites: () =>
        Promise.resolve([{ id: "site_1", subdomain: "northwind" }]),
}));
vi.mock("@/lib/social/read", () => ({
    readPicks: (...a: unknown[]) => h.picks(...a),
}));
vi.mock("@/lib/social/saroh-social", () => ({
    readSocialAccess: () => h.access(),
    listChannels: () => h.channels(),
    listSocialPosts: () => h.posts(),
    getSocialPost: (id: string) => h.post(id),
}));

import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    expectReadContract,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";
import {
    ownPostsServer,
    socialPicksServer,
    socialPostServer,
    socialScreenServer,
} from "@/lib/social/access";

import * as ownRoute from "./own-posts/route";
import * as picksRoute from "./picks/route";
import * as postRoute from "./post/route";
import * as screenRoute from "./route";

const OWNER = { id: "org_a", role: "OWNER", actions: ["social:read"] };
const STAFF = { id: "org_a", role: "MEMBER", actions: ["social:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const ACCESS = {
    state: "on",
    canPost: true,
    canBuy: true,
    plan: { id: "pro", name: "Pro" },
    upgradeTo: null,
    usage: { used: 3, limit: 100, resetsAt: "2099-12-01", requested: false },
    goodTimes: ["2099-11-19T14:00:00.000Z"],
};
/** What the screen draws of a channel. */
const FACTS = {
    kind: "INSTAGRAM",
    state: "CONNECTED",
    handle: "@chaiandcrumb",
    avatarUrl: null,
    connectedAt: "2026-11-01T10:00:00.000Z",
    attention: null,
    grantEndsAt: null,
    waitingPosts: 1,
    heldPosts: 0,
    canConnect: true,
};
/** A channel as an API that leaked more than it should might send it. */
const LEAKY = {
    ...FACTS,
    accessToken: "EAAB-secret",
    pageAccessToken: "EAAP-secret",
    appSecret: "shh",
    signedRequest: "abc.def",
    tokenCiphertext: "x",
    attention: { reason: "expired", since: "2026-11-02", token: "t" },
};
const POST = { id: "p1", status: "DRAFT", title: "Rye", channels: [] };
const OWN = [{ id: "o1", headline: "Hello", createdAt: "2026-11-01" }];
const PICKS = {
    failed: ["offers"],
    pick: {
        products: [],
        services: [],
        posts: [],
        offers: [],
        booking: null,
        links: { site: "/", shop: "/shop", book: "/book" },
        postsPrefix: null,
    },
    links: { links: {}, pages: null },
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.shareOn = true;
    for (const [fn, data] of [
        [h.access, ACCESS],
        [h.channels, { ok: true, data: [LEAKY] }],
        [h.posts, { ok: true, data: [POST] }],
        [h.post, { ok: true, data: POST }],
        [h.own, OWN],
        [h.picks, PICKS],
    ] as const) {
        fn.mockReset();
        fn.mockImplementation(() => Promise.resolve(data));
    }
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    "/api/social": [screenRoute.GET, {}],
    "/api/social/post": [postRoute.GET, { id: "p1" }],
    "/api/social/own-posts": [ownRoute.GET, {}],
    "/api/social/picks": [picksRoute.GET, {}],
} as const;

/** Every key anywhere in `value`. */
function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
    }
    return [];
}
const SECRET = /token|secret|signed|cipher|password|authtag/i;

describe("/api/social/*", () => {
    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(
            socialScreenServer,
            screenRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(
            socialPostServer,
            postRoute.GET,
            "org_a",
            { id: "p1" },
            { id: "p1" },
        );
        expect(h.post).toHaveBeenLastCalledWith("p1");
        await expectReadContract(ownPostsServer, ownRoute.GET, "org_a", {});
        await expectReadContract(
            socialPicksServer,
            picksRoute.GET,
            "org_a",
            {},
        );
        // The business's own site, the one its web address names.
        expect(h.picks).toHaveBeenLastCalledWith(
            OWNER,
            expect.objectContaining({ address: "northwind" }),
            "site_1",
        );
    });

    it("carries a channel's display facts only: no token-like field in the route's JSON or the cache", async () => {
        const res = await screenRoute.GET(
            readRequest("/api/social", { orgId: "org_a" }),
        );
        const body = (await res.json()) as {
            channels: { ok: true; data: unknown[] };
        };
        expect(body.channels.data).toEqual([
            { ...FACTS, attention: { reason: "expired", since: "2026-11-02" } },
        ]);
        expect(keysOf(body).filter((k) => SECRET.test(k))).toEqual([]);

        // What the browser caches is the route's answer: facts only there too.
        const client = makeTestClient();
        await prefetchRead(client, socialScreenServer, "org_a", {});
        const cached = client.getQueryData(["social", "org_a", "screen"]);
        expect(JSON.stringify(cached)).not.toMatch(/secret|EAA|abc\.def/);
        expect(keysOf(cached).filter((k) => SECRET.test(k))).toEqual([]);
    });

    it("is the page's gate on every route: social:read while Share is on", async () => {
        for (const [path, [GET, params]] of Object.entries(ROUTES)) {
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: 200 },
                    staff: { as: as(STAFF), status: 200 },
                    reviewer: { as: as(REVIEWER), status: 403 },
                    "no permissions known": {
                        as: as({ id: "org_a", role: "MEMBER" }),
                        status: 403,
                    },
                    "Share off": {
                        as: () => {
                            as(OWNER)();
                            h.shareOn = false;
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
                () => GET(readRequest(path, { orgId: "org_a", params })),
            );
        }
    });

    it("takes only each read's params, bounded; anything else is a 400 and reads nothing", async () => {
        const bad: [keyof typeof ROUTES, Record<string, string>][] = [
            ["/api/social", { tab: "channels" }],
            ["/api/social/post", {}],
            ["/api/social/post", { id: "x".repeat(101) }],
            ["/api/social/own-posts", { page: "2" }],
            ["/api/social/picks", { site: "site_2" }],
        ];
        for (const [path, params] of bad) {
            const res = await ROUTES[path][0](
                readRequest(path, { orgId: "org_a", params }),
            );
            expect(res.status, `${path} ${JSON.stringify(params)}`).toBe(400);
        }
        for (const fn of [
            h.access,
            h.channels,
            h.posts,
            h.post,
            h.own,
            h.picks,
        ]) {
            expect(fn).not.toHaveBeenCalled();
        }
    });

    it("Saroh Social not open is a 404, the plan unknown a generic failure; a missing post a 404; only GET answers", async () => {
        h.access.mockImplementation(() =>
            Promise.resolve({ ...ACCESS, state: "locked" }),
        );
        const locked = await screenRoute.GET(
            readRequest("/api/social", { orgId: "org_a" }),
        );
        expect(locked.status).toBe(404);
        expect(h.channels).not.toHaveBeenCalled();
        h.access.mockImplementation(() => Promise.resolve(null));
        const unknown = await screenRoute.GET(
            readRequest("/api/social", { orgId: "org_a" }),
        );
        expect(unknown.status).toBe(503);
        expect(await unknown.json()).toEqual({ code: "unavailable" });
        h.post.mockImplementation(() => Promise.resolve({ ok: false }));
        const gone = await postRoute.GET(
            readRequest("/api/social/post", {
                orgId: "org_a",
                params: { id: "p2" },
            }),
        );
        expect(gone.status).toBe(404);
        // Not this business's: the API's 404 is a 404, never an empty list.
        h.own.mockImplementation(() => Promise.resolve(null));
        const refused = await ownRoute.GET(
            readRequest("/api/social/own-posts", { orgId: "org_a" }),
        );
        expect(refused.status).toBe(404);
        h.own.mockImplementation(() => Promise.reject(new Error("down")));
        const failed = await ownRoute.GET(
            readRequest("/api/social/own-posts", { orgId: "org_a" }),
        );
        expect(failed.status).toBe(503);
        expect((await screenRoute.POST()).status).toBe(405);
    });
});
