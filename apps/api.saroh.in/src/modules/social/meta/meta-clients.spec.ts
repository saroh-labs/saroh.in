import { FakeSocialMeta } from "./fake-social-meta";
import { metaErrorOf } from "./graph-http";
import { MetaNotSetUpError, SocialMetaClient } from "./meta-clients";
import { isMetaError } from "./social-meta.port";

/**
 * Meta's clients (U3) against a stand-in `fetch`: each consent link, the
 * token exchanges and refreshes, publishing, and how Meta's errors are
 * read. And the fake the browser specs run on.
 */

const keys = {
    facebook: { appId: "fb-app", appSecret: "fb-secret", configId: "cfg-1" },
    instagram: { appId: "fb-app", appSecret: "fb-secret", configId: "ig-cfg" },
    threads: { appId: "th-app", appSecret: "th-secret" },
};

type Route = [RegExp, unknown, number?];

function client(routes: Route[]) {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
        seen.push({ url, init });
        const route = routes.find(([re]) => re.test(url));
        if (!route) throw new Error(`no route for ${url}`);
        const [, body, status = 200] = route;
        return new Response(JSON.stringify(body), { status });
    });
    return {
        meta: new SocialMetaClient(keys, { fetchFn: fetchFn as never }),
        seen,
    };
}

describe("consent links", () => {
    const { meta } = client([]);
    const input = { redirectUri: "https://api.test/cb", state: "s.t" };

    it("sends Instagram to Facebook's dialog with the Instagram configuration", () => {
        const url = new URL(meta.authorizeUrl("INSTAGRAM", input));
        expect(url.origin + url.pathname).toBe(
            "https://www.facebook.com/v27.0/dialog/oauth",
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({
            client_id: "fb-app",
            redirect_uri: "https://api.test/cb",
            response_type: "code",
            config_id: "ig-cfg",
            override_default_response_type: "true",
            state: "s.t",
        });
    });

    it("sends Facebook Login for Business its configuration, not scopes", () => {
        const url = new URL(meta.authorizeUrl("FACEBOOK", input));
        expect(url.searchParams.get("client_id")).toBe("fb-app");
        expect(url.searchParams.get("config_id")).toBe("cfg-1");
        expect(url.searchParams.get("state")).toBe("s.t");
        expect(url.searchParams.has("scope")).toBe(false);
    });

    it("asks Threads with the Threads app's id", () => {
        const url = new URL(meta.authorizeUrl("THREADS", input));
        expect(url.host).toBe("threads.com");
        expect(url.searchParams.get("client_id")).toBe("th-app");
        expect(url.searchParams.get("scope")).toBe(
            "threads_basic,threads_content_publish",
        );
    });

    it("answers a login with no keys as not set up", () => {
        const bare = new SocialMetaClient({
            facebook: null,
            instagram: null,
            threads: null,
        });
        expect(() => bare.authorizeUrl("THREADS", input)).toThrow(
            MetaNotSetUpError,
        );
    });
});

describe("tokens", () => {
    it("trades an Instagram code, through Facebook Login, for the linked accounts with their Page's token", async () => {
        const { meta, seen } = client([
            [/fb_exchange_token/, { access_token: "long-user" }],
            [/oauth\/access_token/, { access_token: "short-user" }],
            [
                /\/me\/accounts/,
                {
                    data: [
                        {
                            id: "p1",
                            name: "Chai & Crumb",
                            access_token: "pt1",
                            instagram_business_account: {
                                id: "1784",
                                username: "chaiandcrumb",
                                profile_picture_url: "https://cdn/a.jpg",
                            },
                        },
                        // A Page with no Instagram account linked isn't offered.
                        { id: "p2", name: "Crumb Two", access_token: "pt2" },
                    ],
                },
            ],
            [/\/me\?/, { id: "fbu-9" }],
        ]);
        const got = await meta.pageAccounts("INSTAGRAM", "code", "https://cb");
        expect(got).toEqual({
            platformUserId: "fbu-9",
            // No /me/permissions answer here: unknown, and no portfolio lookup.
            seen: { direct: 2, viaBusiness: 0, granted: null, declined: null },
            pages: [
                {
                    accountId: "1784",
                    platformUserId: "fbu-9",
                    handle: "@chaiandcrumb",
                    avatarUrl: "https://cdn/a.jpg",
                    token: "pt1",
                    tokenExpiresAt: null,
                    pageId: "p1",
                },
            ],
        });
        expect(
            seen.every((s) =>
                s.url.startsWith("https://graph.facebook.com/v27.0/"),
            ),
        ).toBe(true);
        expect(seen[0].url).toContain("client_secret=fb-secret");
        expect(seen[1].url).toContain("grant_type=fb_exchange_token");
        expect(decodeURIComponent(seen[3].url)).toContain(
            "instagram_business_account{id,username,profile_picture_url}",
        );
    });

    it("trades a Facebook code for the person's Pages, each with its own token", async () => {
        const { meta } = client([
            [/fb_exchange_token/, { access_token: "long-user" }],
            [/oauth\/access_token/, { access_token: "short-user" }],
            [
                /\/me\/accounts/,
                {
                    data: [
                        { id: "p1", name: "Chai & Crumb", access_token: "pt1" },
                        { id: "p2", name: "Crumb Two", access_token: "pt2" },
                    ],
                },
            ],
            [/\/me\?/, { id: "fbu-9" }],
        ]);
        const got = await meta.pageAccounts("FACEBOOK", "code", "https://cb");
        expect(got.platformUserId).toBe("fbu-9");
        expect(
            got.pages.map((p) => [p.accountId, p.token, p.tokenExpiresAt]),
        ).toEqual([
            ["p1", "pt1", null],
            ["p2", "pt2", null],
        ]);
    });

    it("finds a Page a business portfolio owns, once, with business_management (22 Nov 2026)", async () => {
        const { meta, seen } = client([
            [/fb_exchange_token/, { access_token: "long-user" }],
            [/oauth\/access_token/, { access_token: "short-user" }],
            // The person manages no Page directly: their portfolio owns it.
            [
                /\/me\/accounts/,
                { data: [{ id: "p1", name: "Own", access_token: "pt1" }] },
            ],
            [
                /\/me\/permissions/,
                {
                    data: [
                        { permission: "pages_show_list", status: "granted" },
                        {
                            permission: "business_management",
                            status: "granted",
                        },
                        {
                            permission: "pages_manage_posts",
                            status: "declined",
                        },
                    ],
                },
            ],
            [/\/me\/businesses/, { data: [{ id: "77" }, { id: "../x" }] }],
            [
                /\/77\/owned_pages/,
                {
                    data: [
                        { id: "p1", name: "Own", access_token: "pt1" },
                        {
                            id: "p9",
                            name: "Portfolio Page",
                            access_token: "pt9",
                        },
                    ],
                },
            ],
            [/\/me\?/, { id: "fbu-9" }],
        ]);
        const got = await meta.pageAccounts("FACEBOOK", "code", "https://cb");
        expect(got.pages.map((p) => p.accountId)).toEqual(["p1", "p9"]);
        expect(got.seen).toEqual({
            direct: 1,
            viaBusiness: 1,
            granted: ["pages_show_list", "business_management"],
            declined: ["pages_manage_posts"],
        });
        // A business id that isn't Meta's digits is never put in a path.
        expect(seen.some((c) => c.url.includes("../x"))).toBe(false);
    });

    it("skips the portfolios without business_management", async () => {
        const { meta, seen } = client([
            [/fb_exchange_token/, { access_token: "long-user" }],
            [/oauth\/access_token/, { access_token: "short-user" }],
            [/\/me\/accounts/, { data: [] }],
            [
                /\/me\/permissions/,
                {
                    data: [
                        { permission: "pages_show_list", status: "granted" },
                    ],
                },
            ],
            [/\/me\?/, { id: "fbu-9" }],
        ]);
        const got = await meta.pageAccounts("FACEBOOK", "code", "https://cb");
        expect(got.pages).toEqual([]);
        expect(got.seen?.granted).toEqual(["pages_show_list"]);
        expect(seen.some((c) => c.url.includes("/me/businesses"))).toBe(false);
    });

    it("follows Meta's pages of Pages, only on Graph's own address (S-13)", async () => {
        const { meta, seen } = client([
            [/fb_exchange_token/, { access_token: "long-user" }],
            [/oauth\/access_token/, { access_token: "short-user" }],
            [
                /\/me\/accounts\?after=two/,
                {
                    data: [{ id: "p2", name: "Two", access_token: "pt2" }],
                    paging: { next: "https://evil.example/next" },
                },
            ],
            [
                /\/me\/accounts/,
                {
                    data: [{ id: "p1", name: "One", access_token: "pt1" }],
                    paging: {
                        next: "https://graph.facebook.com/v27.0/me/accounts?after=two",
                    },
                },
            ],
            [/\/me\?/, { id: "fbu-9" }],
        ]);
        const got = await meta.pageAccounts("FACEBOOK", "code", "https://cb");
        expect(got.pages.map((p) => p.accountId)).toEqual(["p1", "p2"]);
        expect(seen.some((c) => c.url.includes("evil.example"))).toBe(false);
    });

    it("refreshes a Threads token", async () => {
        const { meta, seen } = client([
            [/refresh_access_token/, { access_token: "new", expires_in: 100 }],
        ]);
        const got = await meta.refresh("THREADS", "old");
        expect(got.token).toBe("new");
        expect(seen[0].url).toContain("graph.threads.com/refresh_access_token");
        expect(seen[0].url).toContain("grant_type=th_refresh_token");
    });
});

describe("publishing", () => {
    it("makes an Instagram container on graph.facebook.com, reads its status and publishes it", async () => {
        const { meta, seen } = client([
            [/\/media_publish/, { id: "post-1" }],
            [/\/media$/, { id: "c-1" }],
            [/c-1\?fields=status_code/, { status_code: "FINISHED" }],
            [
                /content_publishing_limit/,
                {
                    data: [{ quota_usage: 3, config: { quota_total: 50 } }],
                },
            ],
        ]);
        expect(await meta.publishLimit("INSTAGRAM", "ig-1", "t")).toEqual({
            used: 3,
            total: 50,
        });
        const id = await meta.createContainer("INSTAGRAM", "ig-1", "t", {
            imageUrl: "https://cdn/x.jpg",
            caption: "Hello",
        });
        expect(await meta.containerStatus("INSTAGRAM", id, "t")).toBe(
            "FINISHED",
        );
        expect(await meta.publishContainer("INSTAGRAM", "ig-1", "t", id)).toBe(
            "post-1",
        );
        expect(
            seen.every((s) =>
                s.url.startsWith("https://graph.facebook.com/v27.0/"),
            ),
        ).toBe(true);
        const made = seen.find((s) => s.url.endsWith("/media"));
        expect((made?.init?.body as URLSearchParams).get("image_url")).toBe(
            "https://cdn/x.jpg",
        );
    });

    it("posts a Page photo in one call and finds a post by its ref", async () => {
        const { meta } = client([
            [/\/photos/, { id: "photo-1", post_id: "page_post-1" }],
            [
                /\/posts/,
                {
                    data: [
                        { id: "a", message: "Other" },
                        {
                            id: "b",
                            message: "New ?ref=social-abcd",
                            permalink_url: "https://fb/b",
                        },
                    ],
                },
            ],
        ]);
        expect(
            await meta.postPhoto("p1", "pt", { imageUrl: "u", caption: "c" }),
        ).toBe("page_post-1");
        expect(
            await meta.findByRef("FACEBOOK", "p1", "pt", "social-abcd"),
        ).toEqual({
            id: "b",
            permalink: "https://fb/b",
        });
    });
});

describe("disconnecting", () => {
    it("takes the person's permissions back with the app's own token", async () => {
        const { meta, seen } = client([[/\/permissions/, { success: true }]]);
        await meta.revoke("INSTAGRAM", "fb-user-9");
        expect(seen).toHaveLength(1);
        expect(seen[0].url).toBe(
            "https://graph.facebook.com/v27.0/fb-user-9/permissions",
        );
        expect(seen[0].init?.method).toBe("DELETE");
        expect(
            (seen[0].init?.headers as Record<string, string>).Authorization,
        ).toBe("Bearer fb-app|fb-secret");
    });

    it("says when Meta refuses", async () => {
        const { meta } = client([
            [/\/permissions/, { error: { code: 1, message: "x" } }, 500],
        ]);
        await expect(meta.revoke("FACEBOOK", "u")).rejects.toThrow();
    });
});

describe("Meta's errors", () => {
    it.each([
        [400, { error: { code: 190 } }, "auth"],
        [401, {}, "auth"],
        [403, { error: { code: 200 } }, "auth"],
        [400, { error: { code: 9, error_subcode: 2207042 } }, "limit"],
        [400, { error: { code: 4 } }, "limit"],
        [400, { error: { code: 36003 } }, "media"],
        [400, { error: { code: 100, error_subcode: 2207009 } }, "media"],
        [500, {}, "retry"],
        [429, {}, "retry"],
        [400, { error: { code: 2 } }, "retry"],
        [400, { error: { code: 100 } }, "unknown"],
    ])("reads %s %j as %s", (status, body, kind) => {
        const error = metaErrorOf(status, body);
        expect(error.kind).toBe(kind);
        expect(error.detail).not.toMatch(/token/i);
    });

    it("says when a publishing limit lets it through again", () => {
        const now = new Date("2026-11-18T10:00:00Z");
        const error = metaErrorOf(
            400,
            { error: { code: 9, error_subcode: 2207042 } },
            now,
        );
        expect(error.retryAfter).toEqual(new Date("2026-11-19T10:00:00Z"));
    });

    it("reads a dropped connection as retry", async () => {
        const meta = new SocialMetaClient(keys, {
            fetchFn: (() =>
                Promise.reject(new TypeError("fetch failed"))) as never,
        });
        await expect(meta.refresh("THREADS", "t")).rejects.toMatchObject({
            kind: "retry",
        });
    });
});

describe("the fake", () => {
    it("keeps posts and finds them by ref", async () => {
        const fake = new FakeSocialMeta();
        const c = await fake.createContainer("INSTAGRAM", "ig", "t", {
            imageUrl: "u",
            caption: "Hi ?ref=social-x",
        });
        const id = await fake.publishContainer("INSTAGRAM", "ig", "t", c);
        expect(
            await fake.findByRef("INSTAGRAM", "ig", "t", "social-x"),
        ).toMatchObject({
            id,
        });
    });

    it.each(["auth", "limit", "media", "retry", "unknown"] as const)(
        "fails the next call as %s when told",
        async (kind) => {
            const fake = new FakeSocialMeta();
            fake.failNext("postPhoto", kind);
            const error = await fake
                .postPhoto("p", "t", { imageUrl: "u", caption: "c" })
                .catch((e: unknown) => e);
            expect(isMetaError(error, kind)).toBe(true);
            await expect(
                fake.postPhoto("p", "t", { imageUrl: "u", caption: "c" }),
            ).resolves.toBeTruthy();
        },
    );

    it("posts on a lost answer, so a retry must look before it sends again", async () => {
        const fake = new FakeSocialMeta();
        fake.failNext("postPhoto", "retry");
        await expect(
            fake.postPhoto("p", "t", { imageUrl: "u", caption: "x social-q" }),
        ).rejects.toBeTruthy();
        expect(
            await fake.findByRef("FACEBOOK", "p", "t", "social-q"),
        ).not.toBeNull();
    });

    it("keeps a stuck container in progress and comes straight back from consent", async () => {
        const fake = new FakeSocialMeta();
        fake.stuck = true;
        const c = await fake.createContainer("THREADS", "th", "t", {
            imageUrl: "u",
            caption: "c",
        });
        expect(await fake.containerStatus("THREADS", c)).toBe("IN_PROGRESS");
        const url = new URL(
            fake.authorizeUrl("THREADS", {
                redirectUri: "https://api/cb",
                state: "st",
            }),
        );
        expect(url.searchParams.get("code")).toBe("fake-threads");
        expect(url.searchParams.get("state")).toBe("st");
    });
});
