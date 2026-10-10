import { describe, expect, it, vi } from "vitest";

import type { BrowserSdk, ReplayFacts } from "./browser";
import {
    createBrowserTracking,
    errorsBeforeSend,
    errorsConfig,
    REPLAY_BLOCK_SELECTOR,
    REPLAY_SAMPLE_RATE,
    replayBeforeSend,
    replayConfig,
    replayDecision,
} from "./browser";
import { MAX_BROWSER_EXCEPTIONS_PER_SESSION } from "./names";

function fakeSdk() {
    const instances: {
        name: string;
        config: Record<string, unknown>;
        instance: {
            captureException: ReturnType<typeof vi.fn>;
            startSessionRecording: ReturnType<typeof vi.fn>;
            stopSessionRecording: ReturnType<typeof vi.fn>;
        };
    }[] = [];
    const sdk: BrowserSdk = {
        init(_token, config, name) {
            const instance = {
                captureException: vi.fn(),
                startSessionRecording: vi.fn(),
                stopSessionRecording: vi.fn(),
            };
            instances.push({ name, config, instance });
            return instance;
        },
    };
    return {
        sdk,
        instances,
        load: vi.fn(() => Promise.resolve({ default: sdk })),
    };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/** The item, or a failed test: no `!` on a possibly missing value. */
function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("missing");
    return value;
}

const ALLOWED: ReplayFacts = {
    app: "application",
    replay: "on",
    sharesUsage: true,
    doNotTrack: null,
    globalPrivacyControl: undefined,
    inWorkspaceShell: true,
    userId: "user_1",
};

describe("createBrowserTracking without a key", () => {
    it("returns null and never loads the SDK", () => {
        const { load } = fakeSdk();
        for (const key of [undefined, "", "  "])
            expect(
                createBrowserTracking({
                    key,
                    app: "application",
                    environment: "production",
                    load,
                    replay: "on",
                }),
            ).toBeNull();
        expect(load).not.toHaveBeenCalled();
    });
});

describe("errors", () => {
    it("loads the SDK only at the first error, then sends it scrubbed", async () => {
        const { load, instances } = fakeSdk();
        const tracking = must(
            createBrowserTracking({
                key: "phc_test",
                app: "auth",
                environment: "development",
                load,
            }),
        );
        expect(load).not.toHaveBeenCalled();

        tracking.setIdentity({ userId: "user_1", organizationId: "org_1" });
        tracking.report({
            boundary: "accounts/root",
            digest: "998877",
            name: "TypeError",
            message: "bad address asha@example.com",
            stack: "TypeError: bad address asha@example.com\n    at f (https://x.test/a.js?v=1:1:2)",
        });
        await settle();

        expect(load).toHaveBeenCalledTimes(1);
        expect(instances).toHaveLength(1);
        expect(instances[0].name).toBe("saroh_errors");
        const [error, properties] = instances[0].instance.captureException.mock
            .calls[0] as [Error, Record<string, unknown>];
        expect(error.name).toBe("TypeError");
        expect(error.message).toBe("bad address [email]");
        expect(error.stack).not.toContain("asha@example.com");
        expect(error.stack).not.toContain("?v=1");
        expect(properties).toMatchObject({
            app: "auth",
            environment: "development",
            boundary: "accounts/root",
            digest: "998877",
            user_id: "user_1",
            organization_id: "org_1",
        });
    });

    it("sends the same error once a session, and caps different ones", async () => {
        const { load, instances } = fakeSdk();
        const tracking = must(
            createBrowserTracking({
                key: "phc_test",
                app: "web",
                environment: "production",
                load,
            }),
        );
        const same = { boundary: "web/root", name: "Error", message: "boom" };
        tracking.report(same);
        tracking.report(same);
        tracking.report(same);
        await settle();
        expect(instances[0].instance.captureException).toHaveBeenCalledTimes(1);

        for (let i = 0; i < MAX_BROWSER_EXCEPTIONS_PER_SESSION + 10; i++)
            tracking.report({ ...same, message: `boom ${i}` });
        await settle();
        expect(instances[0].instance.captureException).toHaveBeenCalledTimes(
            MAX_BROWSER_EXCEPTIONS_PER_SESSION,
        );
    });

    it("reports window errors and unhandled rejections", async () => {
        const { load, instances } = fakeSdk();
        const tracking = must(
            createBrowserTracking({
                key: "phc_test",
                app: "admin",
                environment: "production",
                load,
            }),
        );
        const listeners: Record<string, (event: unknown) => void> = {};
        tracking.watchWindow({
            addEventListener: (type: string, fn: unknown) => {
                listeners[type] = fn as (event: unknown) => void;
            },
        });
        listeners.error({ error: new RangeError("too deep") });
        listeners.unhandledrejection({ reason: "rejected for a@b.co" });
        await settle();
        const calls = instances[0].instance.captureException.mock.calls;
        expect(calls).toHaveLength(2);
        expect((calls[0][0] as Error).name).toBe("RangeError");
        expect(calls[0][1]).toMatchObject({ boundary: "window" });
        expect((calls[1][0] as Error).message).toBe("rejected for [email]");
    });

    it("never throws when the SDK fails to load", async () => {
        const tracking = must(
            createBrowserTracking({
                key: "phc_test",
                app: "web",
                environment: "production",
                load: () => Promise.reject(new Error("chunk failed")),
            }),
        );
        expect(() =>
            tracking.report({ boundary: "x", name: "Error", message: "m" }),
        ).not.toThrow();
        await settle();
    });

    it("configures the SDK for exceptions and nothing else", () => {
        const config = errorsConfig("https://eu.i.posthog.com");
        expect(config).toMatchObject({
            api_host: "https://eu.i.posthog.com",
            persistence: "memory",
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_exceptions: false,
            capture_performance: false,
            capture_heatmaps: false,
            capture_dead_clicks: false,
            rageclick: false,
            disable_session_recording: true,
            disable_surveys: true,
            disable_web_experiments: true,
            advanced_disable_flags: true,
            advanced_disable_feature_flags: true,
            disable_external_dependency_loading: true,
            enable_recording_console_log: false,
            person_profiles: "never",
        });
        expect(config.before_send).toBe(errorsBeforeSend);
    });

    it("lets only exceptions out, with addresses reduced to routes", () => {
        expect(errorsBeforeSend({ event: "$pageview" })).toBeNull();
        expect(errorsBeforeSend({ event: "$autocapture" })).toBeNull();
        expect(errorsBeforeSend({ event: "$snapshot" })).toBeNull();
        expect(errorsBeforeSend(null)).toBeNull();
        const out = must(
            errorsBeforeSend({
                event: "$exception",
                $set: { email: "asha@example.com" },
                properties: {
                    $current_url:
                        "https://app.saroh.in/customers/cmf3k2x9w0001abcd1234efgh?q=asha",
                    $pathname: "/customers/cmf3k2x9w0001abcd1234efgh",
                    $referrer: "https://mail.example.com/?to=asha@example.com",
                    $exception_list: [
                        { type: "Error", value: "call +91 98765 43210" },
                    ],
                },
            }),
        );
        expect(out.$set).toBeUndefined();
        expect(out.properties).toMatchObject({
            $current_url: "https://app.saroh.in/customers/:id",
            $pathname: "/customers/:id",
            $exception_list: [{ type: "Error", value: "call [number]" }],
        });
        expect(out.properties).not.toHaveProperty("$referrer");
    });
});

describe("replayDecision", () => {
    it("records only when every rule holds", () => {
        expect(replayDecision(ALLOWED)).toEqual({ record: true });
    });

    it.each([
        [{ replay: undefined }, "switched-off"],
        [{ replay: "off" }, "switched-off"],
        [{ replay: "true" }, "switched-off"],
        [{ sharesUsage: false }, "opted-out"],
        [{ sharesUsage: null }, "opted-out"],
        [{ sharesUsage: undefined }, "opted-out"],
        [{ doNotTrack: "1" }, "browser-signal"],
        [{ doNotTrack: "yes" }, "browser-signal"],
        [{ globalPrivacyControl: true }, "browser-signal"],
        [{ inWorkspaceShell: false }, "outside-shell"],
        [{ userId: undefined }, "no-user"],
        [{ app: "auth" as const }, "not-workspace"],
        [{ app: "admin" as const }, "not-workspace"],
        [{ app: "web" as const }, "not-workspace"],
        [{ app: "sites" as const }, "not-workspace"],
    ])("refuses %j (%s)", (change, why) => {
        expect(replayDecision({ ...ALLOWED, ...change })).toEqual({
            record: false,
            why,
        });
    });
});

describe("replay", () => {
    function workspace(overrides: Record<string, unknown> = {}) {
        const fake = fakeSdk();
        const loadRecorder = vi.fn(() => Promise.resolve({}));
        const tracking = must(
            createBrowserTracking({
                key: "phc_test",
                app: "application",
                environment: "production",
                load: fake.load,
                loadRecorder,
                replay: "on",
                ...overrides,
            }),
        );
        return { ...fake, loadRecorder, tracking };
    }
    const facts = {
        userId: "user_1",
        organizationId: "org_1",
        sharesUsage: true,
        inWorkspaceShell: true,
        doNotTrack: null,
        globalPrivacyControl: false,
    };

    it("starts the masked recorder for the internal user id only", async () => {
        const { tracking, instances, loadRecorder } = workspace();
        expect(await tracking.startReplay(facts)).toBe(true);
        expect(loadRecorder).toHaveBeenCalledTimes(1);
        expect(instances).toHaveLength(1);
        const { config, instance } = instances[0];
        expect(instance.startSessionRecording).toHaveBeenCalledTimes(1);
        // The sample rate decides: no override is passed.
        expect(instance.startSessionRecording).toHaveBeenCalledWith();
        expect(config.bootstrap).toEqual({
            distinctID: "user_1",
            isIdentifiedID: true,
        });
        expect(config).toMatchObject({
            persistence: "memory",
            autocapture: false,
            capture_pageview: false,
            capture_exceptions: false,
            capture_performance: false,
            enable_recording_console_log: false,
            disable_surveys: true,
            advanced_disable_feature_flags: true,
            disable_external_dependency_loading: true,
            session_recording: {
                maskTextSelector: "*",
                maskAllInputs: true,
                blockSelector: REPLAY_BLOCK_SELECTOR,
                blockClass: "ph-no-capture",
                recordHeaders: false,
                recordBody: false,
                recordCrossOriginIframes: false,
                captureCanvas: { recordCanvas: false },
                sampleRate: REPLAY_SAMPLE_RATE,
                strictMinimumDuration: true,
            },
        });
        const recording = config.session_recording as {
            maskCapturedNetworkRequestFn: (r: unknown) => unknown;
        };
        expect(
            recording.maskCapturedNetworkRequestFn({ url: "/x" }),
        ).toBeNull();
        expect(config.before_send).toBe(replayBeforeSend);
    });

    it("blocks pictures, media, drawings, frames and marked elements", () => {
        for (const part of [
            "img",
            "picture",
            "video",
            "audio",
            "canvas",
            "iframe",
            "object",
            "embed",
            "[data-ph-block]",
        ])
            expect(REPLAY_BLOCK_SELECTOR.split(", ")).toContain(part);
        expect(REPLAY_SAMPLE_RATE).toBeGreaterThan(0);
        expect(REPLAY_SAMPLE_RATE).toBeLessThanOrEqual(0.2);
    });

    it.each([
        ["the switch is off", { replay: undefined }, {}],
        ["the switch is not exactly on", { replay: "1" }, {}],
        ["the person opted out", {}, { sharesUsage: false }],
        ["the choice is unknown", {}, { sharesUsage: null }],
        ["Do Not Track is set", {}, { doNotTrack: "1" }],
        ["Global Privacy Control is set", {}, { globalPrivacyControl: true }],
        ["it is outside the workspace shell", {}, { inWorkspaceShell: false }],
        ["nobody is signed in", {}, { userId: undefined }],
        ["the app is accounts", { app: "auth" }, {}],
        ["the app is admin", { app: "admin" }, {}],
        ["the app is saroh.in", { app: "web" }, {}],
        ["the app is a merchant site", { app: "sites" }, {}],
        ["no recorder was handed in", { loadRecorder: undefined }, {}],
    ])("never starts when %s", async (_why, options, change) => {
        const { tracking, instances, load, loadRecorder } = workspace(options);
        expect(await tracking.startReplay({ ...facts, ...change })).toBe(false);
        expect(instances).toHaveLength(0);
        expect(load).not.toHaveBeenCalled();
        expect(loadRecorder).not.toHaveBeenCalled();
    });

    it("stops at once on opt-out, and a start still loading never begins", async () => {
        const { tracking, instances } = workspace();
        await tracking.startReplay(facts);
        tracking.stopReplay();
        expect(
            instances[0].instance.stopSessionRecording,
        ).toHaveBeenCalledTimes(1);

        // Opting out through startReplay's own facts stops it too.
        await tracking.startReplay(facts);
        expect(
            await tracking.startReplay({ ...facts, sharesUsage: false }),
        ).toBe(false);
        expect(
            instances[0].instance.stopSessionRecording,
        ).toHaveBeenCalledTimes(2);

        const slow = workspace();
        const starting = slow.tracking.startReplay(facts);
        slow.tracking.stopReplay();
        expect(await starting).toBe(false);
        expect(slow.instances).toHaveLength(0);
    });

    it("lets only recordings out, without the page's query string", () => {
        expect(replayBeforeSend({ event: "$pageview" })).toBeNull();
        expect(replayBeforeSend({ event: "$exception" })).toBeNull();
        expect(replayBeforeSend({ event: "$identify" })).toBeNull();
        const out = must(
            replayBeforeSend({
                event: "$snapshot",
                $set: { email: "asha@example.com" },
                properties: {
                    $current_url: "https://app.saroh.in/customers?q=asha",
                    $snapshot_data: [
                        {
                            type: 4,
                            data: {
                                href: "https://app.saroh.in/customers?q=asha#top",
                                width: 1,
                            },
                        },
                        { type: 3, data: { source: 1 } },
                    ],
                },
            }),
        );
        expect(out.$set).toBeUndefined();
        expect(JSON.stringify(out)).not.toContain("asha");
        expect(must(out.properties).$snapshot_data).toEqual([
            {
                type: 4,
                data: { href: "https://app.saroh.in/customers", width: 1 },
            },
            { type: 3, data: { source: 1 } },
        ]);
    });

    it("keeps the replay config's switches off too", () => {
        const config = replayConfig("https://eu.i.posthog.com", "user_1");
        expect(config.disable_session_recording).toBe(true);
        expect(config.advanced_disable_flags).toBe(false);
        expect(config.advanced_disable_feature_flags).toBe(true);
    });
});
