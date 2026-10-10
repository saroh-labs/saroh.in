import { describe, expect, it, vi } from "vitest";

import { parseStack } from "./exception-event";
import {
    createRateCap,
    DEFAULT_TRACKING_HOST,
    trackedEnvironment,
    trackingHost,
} from "./names";
import {
    createServerReporter,
    reportRequestError,
    reportWorkerCrash,
} from "./server";

function okFetch() {
    return vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
}

interface Sent {
    api_key: string;
    event: string;
    distinct_id: string;
    properties: Record<string, unknown> & {
        $exception_list: { type: string; value: string; mechanism: unknown }[];
    };
}

/** The n-th request a fake fetch received: its address, text and body. */
function sent(fetch: ReturnType<typeof okFetch>, n = 0) {
    const [url, init] = fetch.mock.calls[n] as unknown as [
        string,
        { body: string },
    ];
    return { url, raw: init.body, body: JSON.parse(init.body) as Sent };
}

describe("createServerReporter", () => {
    it("does nothing at all without a key", async () => {
        const fetch = okFetch();
        for (const key of [undefined, "", "   "]) {
            const report = createServerReporter({
                key,
                app: "sites",
                environment: "production",
                fetch,
            });
            await report(new Error("boom"), { source: "request" });
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it("posts one scrubbed $exception to the EU host by default", async () => {
        const fetch = okFetch();
        const report = createServerReporter({
            key: "phc_test",
            app: "sites",
            environment: "production",
            fetch,
        });
        await report(new Error("no visitor asha@example.com"), {
            source: "request",
            route: "/[domain]/products/[slug]",
            host: "rye.saroh.app",
            digest: "123456",
            method: "GET",
        });
        expect(fetch).toHaveBeenCalledTimes(1);
        const { url, raw, body } = sent(fetch);
        expect(url).toBe(`${DEFAULT_TRACKING_HOST}/i/v0/e/`);
        expect(body.api_key).toBe("phc_test");
        expect(body.event).toBe("$exception");
        expect(body.distinct_id).toBe("saroh-sites-server");
        expect(body.properties).toMatchObject({
            app: "sites",
            environment: "production",
            source: "request",
            route: "/[domain]/products/[slug]",
            site_host: "rye.saroh.app",
            digest: "123456",
            method: "GET",
            $process_person_profile: false,
            $geoip_disable: true,
        });
        const entry = body.properties.$exception_list[0];
        expect(entry.type).toBe("Error");
        expect(entry.value).toBe("no visitor [email]");
        expect(entry.mechanism).toEqual({ handled: false, synthetic: false });
        expect(raw).not.toContain("asha@example.com");
    });

    it("reduces a raw path to a route and never sends its query", async () => {
        const fetch = okFetch();
        const report = createServerReporter({
            key: "phc_test",
            host: "https://ph.example.test/",
            app: "application",
            environment: "development",
            fetch,
        });
        await report(new Error("x"), {
            source: "worker",
            path: "/commerce/orders/cmf3k2x9w0001abcd1234efgh?token=abc",
        });
        const { url, raw, body } = sent(fetch);
        expect(url).toBe("https://ph.example.test/i/v0/e/");
        expect(body.properties.route).toBe("/commerce/orders/:id");
        expect(raw).not.toContain("token");
    });

    it("never throws when PostHog is down or slow", async () => {
        const report = createServerReporter({
            key: "phc_test",
            app: "web",
            environment: "production",
            fetch: vi.fn(() => Promise.reject(new Error("network"))),
        });
        await expect(
            report(new Error("x"), { source: "request" }),
        ).resolves.toBeUndefined();
    });

    it("stops sending past the per-process cap", async () => {
        const fetch = okFetch();
        const report = createServerReporter({
            key: "phc_test",
            app: "web",
            environment: "production",
            fetch,
            rateCap: createRateCap(2, 100),
        });
        for (let i = 0; i < 5; i++)
            await report(new Error(`e${i}`), { source: "request" });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

describe("reportRequestError and reportWorkerCrash", () => {
    const site = {
        key: "phc_test",
        app: "sites" as const,
        vercelEnv: "production",
        siteHost: true,
    };

    it("send nothing without a key", async () => {
        const fetch = okFetch();
        const off = { ...site, key: undefined, fetch };
        await reportRequestError(new Error("x"), { path: "/" }, {}, off);
        await reportWorkerCrash(
            new Error("x"),
            { url: "https://rye.saroh.app/", method: "GET" },
            off,
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it("a merchant site's render error: host and route template, no visitor", async () => {
        const fetch = okFetch();
        const error = Object.assign(new Error("no slot for asha@example.com"), {
            digest: "4471",
        });
        await reportRequestError(
            error,
            {
                path: "/book/cmf3k2x9w0001abcd1234efgh?email=asha@example.com",
                method: "GET",
                headers: {
                    host: "rye.saroh.app",
                    cookie: "saroh_site_session=abc",
                    "user-agent": "Mozilla/5.0",
                    "cf-connecting-ip": "203.0.113.9",
                    referer: "https://rye.saroh.app/?q=asha",
                },
            },
            { routePath: "/[domain]/book/[serviceId]", routeType: "render" },
            { ...site, fetch },
        );
        const { raw, body } = sent(fetch);
        expect(body.distinct_id).toBe("saroh-sites-server");
        expect(body.properties).toMatchObject({
            app: "sites",
            environment: "production",
            source: "request:render",
            route: "/[domain]/book/[serviceId]",
            site_host: "rye.saroh.app",
            digest: "4471",
            method: "GET",
        });
        for (const leak of [
            "asha",
            "saroh_site_session",
            "Mozilla",
            "203.0.113.9",
            "cmf3k2x9w0001abcd1234efgh",
            "referer",
        ])
            expect(raw).not.toContain(leak);
    });

    it("a Worker crash: the path as a template, the host only for a site", async () => {
        const fetch = okFetch();
        const request = {
            url: "https://app.saroh.in/customers/cmf3k2x9w0001abcd1234efgh?q=asha",
            method: "POST",
        };
        await reportWorkerCrash(new Error("boom"), request, {
            key: "phc_test",
            app: "application",
            vercelEnv: "preview",
            fetch,
        });
        const { raw, body } = sent(fetch);
        expect(body.properties).toMatchObject({
            app: "application",
            environment: "development",
            source: "worker",
            route: "/customers/:id",
            method: "POST",
        });
        expect(body.properties).not.toHaveProperty("site_host");
        expect(raw).not.toContain("asha");

        await reportWorkerCrash(new Error("boom"), request, {
            ...site,
            fetch,
        });
        expect(sent(fetch, 1).body.properties.site_host).toBe("app.saroh.in");
    });
});

describe("createRateCap", () => {
    it("caps per minute and per hour, and recovers", () => {
        let now = 0;
        const cap = createRateCap(2, 3, () => now);
        expect([cap.allow(), cap.allow(), cap.allow()]).toEqual([
            true,
            true,
            false,
        ]);
        now += 61_000;
        expect(cap.allow()).toBe(true);
        // Three in the hour now.
        now += 61_000;
        expect(cap.allow()).toBe(false);
        now += 3_600_000;
        expect(cap.allow()).toBe(true);
    });
});

describe("names", () => {
    it("says production only for the production marker", () => {
        expect(trackedEnvironment("production")).toBe("production");
        for (const v of ["preview", "development", "prod", "", undefined])
            expect(trackedEnvironment(v)).toBe("development");
    });

    it("defaults the host and trims a trailing slash", () => {
        expect(trackingHost(undefined)).toBe(DEFAULT_TRACKING_HOST);
        expect(trackingHost("")).toBe(DEFAULT_TRACKING_HOST);
        expect(trackingHost("https://x.test//")).toBe("https://x.test");
    });
});

describe("parseStack", () => {
    it("reads V8 frames, oldest call first", () => {
        const frames = parseStack(
            [
                "Error: x",
                "    at inner (/app/dist/a.js:10:5)",
                "    at /app/node_modules/lib/b.js:2:1",
                "    at async Promise.all (index 0)",
            ].join("\n"),
        );
        expect(frames).toHaveLength(3);
        expect(frames[2]).toMatchObject({
            platform: "custom",
            lang: "javascript",
            function: "inner",
            filename: "/app/dist/a.js",
            lineno: 10,
            colno: 5,
            in_app: true,
        });
        expect(frames[1]).toMatchObject({
            function: "<anonymous>",
            filename: "/app/node_modules/lib/b.js",
            in_app: false,
        });
    });

    it("is empty for no stack", () => {
        expect(parseStack(undefined)).toEqual([]);
    });
});
