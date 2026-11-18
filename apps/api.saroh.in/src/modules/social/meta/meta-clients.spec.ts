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
    instagram: { appId: "ig-app", appSecret: "ig-secret" },
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

    it("asks Instagram for its two publishing scopes with the Instagram app's id", () => {
        const url = new URL(meta.authorizeUrl("INSTAGRAM", input));
        expect(url.origin + url.pathname).toBe(
            "https://www.instagram.com/oauth/authorize",
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({
            client_id: "ig-app",
            redirect_uri: "https://api.test/cb",
            response_type: "code",
            scope: "instagram_business_basic,instagram_business_content_publish",
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
    it("trades an Instagram code for a 60-day token and reads the account", async () => {
        const { meta, seen } = client([
            [
                /api\.instagram\.com\/oauth/,
                { access_token: "short", user_id: 17 },
            ],
            [
                /graph\.instagram\.com\/access_token/,
                { access_token: "long", expires_in: 5_184_000 },
            ],
            [
                /graph\.instagram\.com\/v27\.0\/me/,
                {
                    user_id: "1784",
                    username: "chaiandcrumb",
                    account_type: "BUSINESS",
                },
            ],
        ]);
        const at = Date.now();
        const account = await meta.connect("INSTAGRAM", "code-1", "https://cb");
        expect(account).toMatchObject({
            accountId: "1784",
            platformUserId: "17",
            handle: "@chaiandcrumb",
            token: "long",
            accountType: "BUSINESS",
        });
        expect(account.tokenExpiresAt!.getTime()).toBeGreaterThanOrEqual(
            at + 5_184_000_000 - 1000,
        );
        const exchange = seen[0].init?.body as URLSearchParams;
        expect(exchange.get("grant_type")).toBe("authorization_code");
        expect(exchange.get("client_secret")).toBe("ig-secret");
        expect(seen[1].url).toContain("grant_type=ig_exchange_token");
        expect(
            (seen[2].init?.headers as Record<string, string>).Authorization,
        ).toBe("Bearer long");
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
        const got = await meta.facebookPages("code", "https://cb");
        expect(got.platformUserId).toBe("fbu-9");
        expect(
            got.pages.map((p) => [p.accountId, p.token, p.tokenExpiresAt]),
        ).toEqual([
            ["p1", "pt1", null],
            ["p2", "pt2", null],
        ]);
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
    it("makes an Instagram container, reads its status and publishes it", async () => {
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
        await expect(meta.refresh("INSTAGRAM", "t")).rejects.toMatchObject({
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
