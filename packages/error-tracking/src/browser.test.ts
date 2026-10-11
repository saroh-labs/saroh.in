import { describe, expect, it, vi } from "vitest";

import type { BrowserSdk, ReplayFacts, SiteReplayFacts } from "./browser";
import {
    createBrowserTracking,
    errorsBeforeSend,
    errorsConfig,
    hideFigures,
    maskWorkspaceAttribute,
    maskWorkspaceText,
    REPLAY_BLOCK_SELECTOR,
    REPLAY_SAMPLE_RATE,
    replayBeforeSend,
    replayConfig,
    replayDecision,
    replayReadable,
    replaySampleRate,
    SITE_REPLAY_BLOCK_SELECTOR,
    siteReplayConfig,
    siteReplayDecision,
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
    noticeShown: true,
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
        // Nobody is recorded before the notice has been shown to them.
        [{ noticeShown: false }, "not-told"],
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
        noticeShown: true,
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
                // Every text node goes to the function, which unmasks only
                // what is marked as Saroh's own words.
                maskTextSelector: "*",
                maskTextFn: maskWorkspaceText,
                maskAttributeFn: maskWorkspaceAttribute,
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
    });

    it("records every allowed session unless the environment says a share", async () => {
        expect(REPLAY_SAMPLE_RATE).toBe(1);
        expect(replaySampleRate(undefined)).toBe(1);
        expect(replaySampleRate("")).toBe(1);
        expect(replaySampleRate("0.25")).toBe(0.25);
        expect(replaySampleRate("0")).toBe(0);
        // Not a share from 0 to 1: ignored, never guessed at.
        for (const bad of ["2", "-0.1", "half", "NaN", "20%"])
            expect(replaySampleRate(bad)).toBe(1);

        const { tracking, instances } = workspace({ replaySample: "0.5" });
        await tracking.startReplay(facts);
        expect(instances[0].config.session_recording).toMatchObject({
            sampleRate: 0.5,
        });
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
        ["the notice has not been shown", {}, { noticeShown: false }],
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

/** An element as the recorder hands it over: `closest`, and its tag. */
function under(...marks: string[]) {
    return {
        tagName: "SPAN",
        closest: (selector: string) =>
            marks.some((mark) => selector === `[${mark}]`) ? {} : null,
    };
}

describe("what a workspace recording can read (DEC-125, 10 Oct)", () => {
    it("masks every character unless the words are marked as Saroh's own", () => {
        expect(maskWorkspaceText("Asha Rao", under())).toBe("**** ***");
        expect(maskWorkspaceText("Save changes", under("data-ph-unmask"))).toBe(
            "Save changes",
        );
    });

    it("a masked mark wins over an unmasked one, above or below it", () => {
        const both = under("data-ph-unmask", "data-ph-mask");
        expect(replayReadable(both)).toBe(false);
        expect(maskWorkspaceText("Asha Rao", both)).toBe("**** ***");
    });

    it("masks what it can't place: no element, or one that can't be asked", () => {
        expect(maskWorkspaceText("Asha", undefined)).toBe("****");
        expect(maskWorkspaceText("Asha", null)).toBe("****");
        expect(maskWorkspaceText("Asha", {})).toBe("****");
        expect(
            maskWorkspaceText("Asha", {
                closest: () => {
                    throw new Error("detached");
                },
            }),
        ).toBe("****");
    });

    it("hides digits and emails even in readable words", () => {
        const safe = under("data-ph-unmask");
        expect(maskWorkspaceText("Take ₹1,250.00", safe)).toBe(
            "Take ₹*,***.**",
        );
        expect(maskWorkspaceText("Step 2 of 4", safe)).toBe("Step * of *");
        expect(maskWorkspaceText("Sent to asha@example.com today", safe)).toBe(
            "Sent to **************** today",
        );
        expect(hideFigures("+91 98765 43210")).toBe("+** ***** *****");
        // Other scripts' digits too.
        expect(hideFigures("₹१२३")).toBe("₹***");
    });

    // CodeQL js/polynomial-redos (PR #927): this ran on every text node as
    // one pattern around the `@`, which backtracked on a long run without one.
    it("stays fast on a long run of text with no @ in it", () => {
        const hostile = "!".repeat(200_000);
        const started = performance.now();
        expect(hideFigures(hostile)).toBe(hostile);
        expect(performance.now() - started).toBeLessThan(500);
        expect(hideFigures("mail a@b.co\tnow\nok")).toBe(
            "mail ******\tnow\nok",
        );
    });

    it("keeps whitespace, so the page keeps its shape", () => {
        expect(maskWorkspaceText("  a b\n c ", under())).toBe("  * *\n * ");
    });

    it("masks the attributes that hold words, by the same rule", () => {
        expect(maskWorkspaceAttribute("title", "Asha Rao", under())).toBe(
            "**** ***",
        );
        expect(
            maskWorkspaceAttribute("aria-label", "Open Asha Rao", under()),
        ).toBe("**** **** ***");
        expect(maskWorkspaceAttribute("placeholder", "Search", under())).toBe(
            "******",
        );
        expect(
            maskWorkspaceAttribute(
                "aria-label",
                "Close",
                under("data-ph-unmask"),
            ),
        ).toBe("Close");
        expect(maskWorkspaceAttribute("data-value", "asha rao", under())).toBe(
            "**** ***",
        );
    });

    it("keeps a link's path and nothing that could name a person", () => {
        const a = { ...under(), tagName: "A" };
        const href = (value: string) =>
            maskWorkspaceAttribute("href", value, a);
        expect(href("/customers?q=asha#x")).toBe("/customers");
        expect(href("/customers/cus_1/orders")).toBe("/customers/cus_1/orders");
        expect(href("mailto:asha@example.com")).toBe("#");
        expect(href("tel:+919876543210")).toBe("#");
        expect(href("https://rye.saroh.app/?ref=asha")).toBe("#");
        expect(href("//evil.example/x")).toBe("#");
        expect(href("#main-content")).toBe("#main-content");
        expect(
            maskWorkspaceAttribute("action", "/search?q=asha", {
                ...under(),
                tagName: "FORM",
            }),
        ).toBe("/search");
    });

    it("leaves a stylesheet's or a script's address alone: it draws the page", () => {
        const sheet = "https://app.saroh.in/_next/static/css/app.css?dpl=1";
        expect(
            maskWorkspaceAttribute("href", sheet, {
                ...under(),
                tagName: "LINK",
            }),
        ).toBe(sheet);
        expect(maskWorkspaceAttribute("href", sheet, undefined)).toBe(sheet);
    });

    it("leaves what draws the page alone", () => {
        for (const [name, value] of [
            ["class", "flex gap-2"],
            ["data-state", "open"],
            ["style", "width: 10px"],
            ["role", "dialog"],
            ["id", "usage-sharing-title"],
        ])
            expect(maskWorkspaceAttribute(name, value, under())).toBe(value);
    });
});

const SITE_ALLOWED: SiteReplayFacts = {
    app: "web",
    replay: "on",
    consent: "granted",
    teamBrowser: false,
    doNotTrack: null,
    globalPrivacyControl: undefined,
};

describe("siteReplayDecision (saroh.in)", () => {
    it("records only when every rule holds", () => {
        expect(siteReplayDecision(SITE_ALLOWED)).toEqual({ record: true });
    });

    it.each([
        [{ replay: undefined }, "switched-off"],
        [{ replay: "off" }, "switched-off"],
        [{ consent: null }, "no-consent"],
        [{ consent: undefined }, "no-consent"],
        [{ consent: "refused" as const }, "no-consent"],
        [{ teamBrowser: true }, "team"],
        [{ doNotTrack: "1" }, "browser-signal"],
        [{ doNotTrack: "yes" }, "browser-signal"],
        [{ globalPrivacyControl: true }, "browser-signal"],
        [{ app: "application" as const }, "not-site"],
        [{ app: "auth" as const }, "not-site"],
        [{ app: "admin" as const }, "not-site"],
        [{ app: "sites" as const }, "not-site"],
    ])("refuses %j (%s)", (change, why) => {
        expect(siteReplayDecision({ ...SITE_ALLOWED, ...change })).toEqual({
            record: false,
            why,
        });
    });
});

describe("saroh.in's replay", () => {
    function site(overrides: Record<string, unknown> = {}) {
        const fake = fakeSdk();
        const loadRecorder = vi.fn(() => Promise.resolve({}));
        const tracking = must(
            createBrowserTracking({
                key: "phc_test",
                app: "web",
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
        consent: "granted" as const,
        teamBrowser: false,
        doNotTrack: null,
        globalPrivacyControl: false,
    };

    it("starts after consent, about nobody, with the page's text readable", async () => {
        const { tracking, instances, loadRecorder } = site();
        expect(await tracking.startSiteReplay(facts)).toBe(true);
        expect(loadRecorder).toHaveBeenCalledTimes(1);
        expect(instances).toHaveLength(1);
        const { config, instance } = instances[0];
        expect(instance.startSessionRecording).toHaveBeenCalledWith();
        // Nobody is identified, and nothing is stored in the browser.
        expect(config.bootstrap).toBeUndefined();
        expect(config).toMatchObject({
            persistence: "memory",
            person_profiles: "never",
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_exceptions: false,
            capture_performance: false,
            capture_heatmaps: false,
            enable_recording_console_log: false,
            advanced_disable_feature_flags: true,
            disable_external_dependency_loading: true,
            session_recording: {
                // Only what a page marks is masked; the rest is Saroh's own.
                maskTextSelector: "[data-ph-mask]",
                maskAllInputs: true,
                blockSelector: SITE_REPLAY_BLOCK_SELECTOR,
                recordHeaders: false,
                recordBody: false,
                recordCrossOriginIframes: false,
                captureCanvas: { recordCanvas: false },
                sampleRate: 1,
            },
        });
        const recording = config.session_recording as {
            maskTextFn?: unknown;
            maskCapturedNetworkRequestFn: (r: unknown) => unknown;
        };
        expect(recording.maskTextFn).toBeUndefined();
        expect(
            recording.maskCapturedNetworkRequestFn({ url: "/x" }),
        ).toBeNull();
        // Only the recording leaves: no pageview, no click, no identify.
        expect(config.before_send).toBe(replayBeforeSend);
    });

    it.each([
        ["the switch is off", { replay: undefined }, {}],
        ["the visitor has not answered", {}, { consent: null }],
        ["the visitor refused", {}, { consent: "refused" as const }],
        ["it is a Saroh team browser", {}, { teamBrowser: true }],
        ["Do Not Track is set", {}, { doNotTrack: "1" }],
        ["Global Privacy Control is set", {}, { globalPrivacyControl: true }],
        ["no recorder was handed in", { loadRecorder: undefined }, {}],
        ["the app is the workspace", { app: "application" }, {}],
        ["the app is accounts", { app: "auth" }, {}],
        ["the app is admin", { app: "admin" }, {}],
        ["the app is a merchant site", { app: "sites" }, {}],
    ])("never loads or starts when %s", async (_why, options, change) => {
        const { tracking, instances, load, loadRecorder } = site(options);
        expect(await tracking.startSiteReplay({ ...facts, ...change })).toBe(
            false,
        );
        expect(instances).toHaveLength(0);
        expect(load).not.toHaveBeenCalled();
        expect(loadRecorder).not.toHaveBeenCalled();
    });

    it("stops when consent is taken back, and starts again when it is given", async () => {
        const { tracking, instances } = site();
        await tracking.startSiteReplay(facts);
        expect(
            await tracking.startSiteReplay({ ...facts, consent: "refused" }),
        ).toBe(false);
        expect(
            instances[0].instance.stopSessionRecording,
        ).toHaveBeenCalledTimes(1);
        // "Cookie choices" forgets the answer: still stopped.
        expect(
            await tracking.startSiteReplay({ ...facts, consent: null }),
        ).toBe(false);
        expect(await tracking.startSiteReplay(facts)).toBe(true);
        // The same instance: one per page.
        expect(instances).toHaveLength(1);
        expect(
            instances[0].instance.startSessionRecording,
        ).toHaveBeenCalledTimes(2);
    });

    it("the workspace's way of starting never works on saroh.in", async () => {
        const { tracking, instances } = site();
        expect(
            await tracking.startReplay({
                userId: "user_1",
                sharesUsage: true,
                inWorkspaceShell: true,
                noticeShown: true,
            }),
        ).toBe(false);
        expect(instances).toHaveLength(0);
    });

    it("draws Saroh's own pictures, and leaves out frames and marked elements", () => {
        const parts = SITE_REPLAY_BLOCK_SELECTOR.split(", ");
        for (const part of ["iframe", "object", "embed", "[data-ph-block]"])
            expect(parts).toContain(part);
        expect(parts).not.toContain("img");
        const config = siteReplayConfig("https://eu.i.posthog.com");
        expect(config.disable_session_recording).toBe(true);
    });
});
