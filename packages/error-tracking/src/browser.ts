import type { PostHogConfig } from "posthog-js";

import type { TrackedApp, TrackedEnvironment } from "./names";
import { MAX_BROWSER_EXCEPTIONS_PER_SESSION, trackingHost } from "./names";
import {
    routeTemplate,
    scrubContext,
    scrubMessage,
    scrubStack,
    scrubText,
} from "./scrub";

/**
 * The browser half (DEC-125): exceptions from app, accounts, admin and
 * saroh.in, and the workspace's masked session replay. Merchant sites never
 * import this file (scripts/check-merchant-site-tracking.mjs).
 *
 * The app hands the SDK in (`load: () => import("posthog-js/…")`), so this
 * package has no runtime dependency and the SDK is not even downloaded until
 * there is something to send: the first error, or a replay that is allowed
 * to start. Without a key, {@link createBrowserTracking} returns null and
 * nothing is loaded at all.
 *
 * Two SDK instances, never mixed:
 *  - **errors**: exceptions only. No request for flags or remote settings,
 *    no pageviews, no autocapture, nothing stored (`persistence: "memory"`),
 *    and `before_send` drops every event that is not an exception.
 *  - **replay** (workspace only, off unless every rule in
 *    {@link replayDecision} holds): the recorder with all text and inputs
 *    masked and images, media, frames and anything marked `data-ph-block`
 *    blocked; `before_send` drops every event that is not a recording.
 */

/** What a boundary or the window hands over: structurally `@saroh/ui`'s report. */
export interface BrowserErrorReport {
    name: string;
    message: string;
    stack?: string;
    /** Which boundary caught it, or "window". */
    boundary: string;
    digest?: string;
}

/** The part of a posthog-js instance this file uses. */
export interface BrowserSdkInstance {
    captureException(
        error: unknown,
        properties?: Record<string, unknown>,
    ): unknown;
    startSessionRecording(override?: { sampling?: boolean } | true): void;
    stopSessionRecording(): void;
}

/** The part of posthog-js this file uses: `init` with a name makes an instance. */
export interface BrowserSdk {
    init(
        token: string,
        config: Record<string, unknown>,
        name: string,
    ): BrowserSdkInstance | undefined;
}

export interface BrowserTrackingOptions {
    /** The public project key (`phc_…`). Unset or empty: null is returned. */
    key: string | undefined;
    host?: string | undefined;
    app: TrackedApp;
    environment: TrackedEnvironment;
    /** `() => import("posthog-js/dist/module.no-external")`, from the app. */
    load: () => Promise<{ default: BrowserSdk } | BrowserSdk>;
    /**
     * `() => import("posthog-js/dist/posthog-recorder")`: the recorder, from
     * the app's own bundle. Only the workspace passes it.
     */
    loadRecorder?: () => Promise<unknown>;
    /** `POSTHOG_REPLAY`: replay is possible only when this is "on". */
    replay?: string | undefined;
}

/* ------------------------------------------------------------------ *
 * Session replay: who is recorded, and what a recording can hold
 * ------------------------------------------------------------------ */

/**
 * The share of allowed workspace sessions that are recorded. PostHog's free
 * plan keeps 5,000 recordings a month; at one in five, that is room for
 * about 25,000 workspace sessions a month before any is refused.
 */
export const REPLAY_SAMPLE_RATE = 0.2;

/**
 * What the recorder never draws: pictures, media, drawings, embedded pages,
 * and anything a screen marks as customer data in a form that isn't text
 * (`data-ph-block`, or the SDK's own `ph-no-capture` class). A blocked
 * element is a same-sized blank box in the recording.
 */
export const REPLAY_BLOCK_SELECTOR =
    "img, picture, video, audio, canvas, iframe, object, embed, [data-ph-block]";

export interface ReplayFacts {
    /** Which app is asking. Only the workspace ("application") may record. */
    app: TrackedApp;
    /** `POSTHOG_REPLAY`. */
    replay: string | undefined;
    /** The person's saved choice. Anything but `true` is no. */
    sharesUsage: boolean | null | undefined;
    /** `navigator.doNotTrack` (or the old `window.doNotTrack`). */
    doNotTrack: string | null | undefined;
    /** `navigator.globalPrivacyControl`. */
    globalPrivacyControl: boolean | undefined;
    /** Whether the signed-in workspace shell is what is on screen. */
    inWorkspaceShell: boolean;
    /** The internal user id; a recording is never anonymous. */
    userId: string | undefined;
}

/**
 * Whether this session may be recorded, and why not. Every rule must hold;
 * the first that fails is named (for tests and for the docs, never shown).
 */
export function replayDecision(facts: ReplayFacts):
    | { record: true }
    | {
          record: false;
          why:
              | "not-workspace"
              | "switched-off"
              | "outside-shell"
              | "no-user"
              | "opted-out"
              | "browser-signal";
      } {
    if (facts.app !== "application")
        return { record: false, why: "not-workspace" };
    if (facts.replay !== "on") return { record: false, why: "switched-off" };
    if (!facts.inWorkspaceShell) return { record: false, why: "outside-shell" };
    if (!facts.userId) return { record: false, why: "no-user" };
    if (facts.sharesUsage !== true) return { record: false, why: "opted-out" };
    if (
        facts.globalPrivacyControl === true ||
        facts.doNotTrack === "1" ||
        facts.doNotTrack === "yes"
    )
        return { record: false, why: "browser-signal" };
    return { record: true };
}

/** The browser's own "don't track me" signals, read where a window exists. */
export function browserPrivacySignals(): Pick<
    ReplayFacts,
    "doNotTrack" | "globalPrivacyControl"
> {
    if (typeof navigator === "undefined")
        return { doNotTrack: undefined, globalPrivacyControl: undefined };
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const legacy =
        typeof window === "undefined"
            ? undefined
            : (window as Window & { doNotTrack?: string }).doNotTrack;
    return {
        doNotTrack: nav.doNotTrack ?? legacy,
        globalPrivacyControl: nav.globalPrivacyControl,
    };
}

/* ------------------------------------------------------------------ *
 * The two SDK configurations
 * ------------------------------------------------------------------ */

/** Everything the SDK can do besides what one instance is for, switched off. */
function everythingOff(host: string) {
    return {
        api_host: host,
        // Nothing is stored: no cookie, no localStorage, no sessionStorage.
        persistence: "memory",
        disable_persistence: false,
        autocapture: false,
        rageclick: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_performance: false,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        // Exceptions go through Saroh's own seam, scrubbed; the SDK's own
        // listeners would send them raw.
        capture_exceptions: false,
        disable_surveys: true,
        disable_web_experiments: true,
        disable_product_tours: true,
        disable_conversations: true,
        enable_recording_console_log: false,
        save_referrer: false,
        save_campaign_params: false,
        disable_scroll_properties: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        // Never fetch a script from PostHog: what runs is what the app built.
        disable_external_dependency_loading: true,
        advanced_disable_feature_flags: true,
        advanced_disable_feature_flags_on_first_load: true,
        advanced_disable_toolbar_metrics: true,
        opt_in_site_apps: false,
        respect_dnt: false,
    } satisfies Partial<PostHogConfig>;
}

/** Properties the SDK adds by itself that say where a person was or came from. */
const DROPPED_PROPERTIES = [
    "$referrer",
    "$referring_domain",
    "$initial_referrer",
    "$initial_referring_domain",
    "$initial_current_url",
    "$initial_pathname",
    "$session_entry_url",
    "$session_entry_referrer",
    "$session_entry_referring_domain",
    "$session_entry_pathname",
    "$prev_pageview_pathname",
    "title",
    "$title",
];

interface SdkEvent {
    event: string;
    properties?: Record<string, unknown>;
    $set?: unknown;
    $set_once?: unknown;
}

/** The page's address as a route: origin kept, ids and the query string gone. */
function templatedUrl(url: unknown): string | undefined {
    if (typeof url !== "string" || !url) return undefined;
    const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/iu.exec(url)?.[0] ?? "";
    return `${origin}${routeTemplate(url)}`;
}

/** Shared by both instances: no person properties, no raw addresses. */
function withoutPersonalProperties<T extends SdkEvent>(event: T): T {
    const properties = { ...(event.properties ?? {}) };
    for (const key of DROPPED_PROPERTIES) delete properties[key];
    const url = templatedUrl(properties.$current_url);
    if (url) properties.$current_url = url;
    if (typeof properties.$pathname === "string")
        properties.$pathname = routeTemplate(properties.$pathname);
    const { $set: _set, $set_once: _setOnce, ...rest } = event;
    return { ...rest, properties } as T;
}

/**
 * The errors instance's last gate: only `$exception` leaves, and every
 * exception's words and frames are scrubbed again here, whoever built them.
 */
export function errorsBeforeSend(event: SdkEvent | null): SdkEvent | null {
    if (event?.event !== "$exception") return null;
    const clean = withoutPersonalProperties(event);
    const list = clean.properties?.$exception_list;
    if (Array.isArray(list)) {
        clean.properties = {
            ...clean.properties,
            $exception_list: list.map((entry: Record<string, unknown>) => ({
                ...entry,
                ...(typeof entry.type === "string"
                    ? { type: scrubText(entry.type).slice(0, 100) }
                    : {}),
                ...(typeof entry.value === "string"
                    ? { value: scrubMessage(entry.value) }
                    : {}),
            })),
        };
    }
    return clean;
}

/** rrweb's "meta" event: the page's address, its width and its height. */
const RRWEB_META = 4;

/**
 * The replay instance's last gate: only recordings leave, and the page
 * address inside each one loses its query string (a search box's words live
 * there). Events are sent uncompressed so this can read them.
 */
export function replayBeforeSend(event: SdkEvent | null): SdkEvent | null {
    if (event?.event !== "$snapshot") return null;
    const clean = withoutPersonalProperties(event);
    const data = clean.properties?.$snapshot_data;
    if (Array.isArray(data)) {
        clean.properties = {
            ...clean.properties,
            $snapshot_data: data.map((item: unknown) => {
                const entry = item as {
                    type?: number;
                    data?: { href?: unknown };
                } | null;
                if (
                    entry?.type !== RRWEB_META ||
                    typeof entry.data?.href !== "string"
                )
                    return item;
                return {
                    ...entry,
                    data: {
                        ...entry.data,
                        href: entry.data.href.split(/[?#]/u)[0],
                    },
                };
            }),
        };
    }
    return clean;
}

/** The errors instance: exceptions, and nothing else the SDK can do. */
export function errorsConfig(host: string): Record<string, unknown> {
    return {
        ...everythingOff(host),
        // No request to PostHog at start-up: no flags, no remote settings.
        advanced_disable_flags: true,
        disable_session_recording: true,
        person_profiles: "never",
        before_send: errorsBeforeSend as never,
    } satisfies Partial<PostHogConfig>;
}

/**
 * The replay instance: the recorder, masked. It does ask PostHog for the
 * project's settings (a recording starts only if the project records at
 * all, and the minimum length kept is set there), but evaluates no flag.
 */
export function replayConfig(
    host: string,
    userId: string,
): Record<string, unknown> {
    return {
        ...everythingOff(host),
        advanced_disable_flags: false,
        // Off until `startSessionRecording()`, called only after the rules hold.
        disable_session_recording: true,
        // The internal user id and nothing else: no name, no email.
        bootstrap: { distinctID: userId, isIdentifiedID: true },
        person_profiles: "identified_only",
        session_recording: {
            // Every character of every text node, and every input's value.
            maskTextSelector: "*",
            maskAllInputs: true,
            maskInputOptions: { password: true },
            blockClass: "ph-no-capture",
            blockSelector: REPLAY_BLOCK_SELECTOR,
            // No request or response of the page's own is ever recorded.
            recordHeaders: false,
            recordBody: false,
            maskCapturedNetworkRequestFn: () => null,
            recordCrossOriginIframes: false,
            collectFonts: false,
            captureCanvas: { recordCanvas: false },
            // Uncompressed, so `replayBeforeSend` can strip query strings.
            compress_events: false,
            sampleRate: REPLAY_SAMPLE_RATE,
            // The project's minimum length counts recorded time, not the tab's.
            strictMinimumDuration: true,
        },
        before_send: replayBeforeSend as never,
    } satisfies Partial<PostHogConfig>;
}

/* ------------------------------------------------------------------ *
 * The tracker an app holds
 * ------------------------------------------------------------------ */

export interface BrowserTracking {
    /** Send one error: scrubbed, once per session, capped. */
    report(report: BrowserErrorReport): void;
    /** Report `window`'s uncaught errors and unhandled rejections too. */
    watchWindow(target?: Pick<Window, "addEventListener">): void;
    /** Internal ids sent beside each error. Never a name or an email. */
    setIdentity(ids: { userId?: string; organizationId?: string }): void;
    /**
     * Start recording if every rule holds ({@link replayDecision}); resolves
     * whether it started. Safe to call again when a fact changes.
     */
    startReplay(
        facts: Omit<
            ReplayFacts,
            "app" | "replay" | "doNotTrack" | "globalPrivacyControl"
        > &
            Partial<
                Pick<ReplayFacts, "doNotTrack" | "globalPrivacyControl">
            > & {
                organizationId?: string;
            },
    ): Promise<boolean>;
    /** Stop recording at once (the person opted out, or left the shell). */
    stopReplay(): void;
}

function sdkOf(loaded: { default: BrowserSdk } | BrowserSdk): BrowserSdk {
    return "default" in loaded ? loaded.default : loaded;
}

/** Null without a key: nothing is loaded, registered or sent. */
export function createBrowserTracking(
    options: BrowserTrackingOptions,
): BrowserTracking | null {
    const key = options.key?.trim();
    if (!key) return null;
    const host = trackingHost(options.host);
    const { app, environment } = options;

    let sdk: Promise<BrowserSdk> | null = null;
    const loadSdk = () => (sdk ??= options.load().then(sdkOf));

    let errors: Promise<BrowserSdkInstance | undefined> | null = null;
    const errorsInstance = () =>
        (errors ??= loadSdk().then((s) =>
            s.init(key, errorsConfig(host), "saroh_errors"),
        ));

    const seen = new Set<string>();
    let identity: { userId?: string; organizationId?: string } = {};

    let replay: BrowserSdkInstance | undefined;
    let replayUser: string | undefined;
    let recording = false;
    // Bumped by every start and stop, so a start that was still loading the
    // recorder when the person opted out never begins.
    let replayTurn = 0;

    const tracking: BrowserTracking = {
        report(report) {
            const message = scrubMessage(report.message);
            const stack = report.stack ? scrubStack(report.stack) : undefined;
            const firstFrame =
                stack?.split("\n").find((l) => /^\s*at /u.test(l)) ?? "";
            const fingerprint = `${report.name}|${message}|${firstFrame.trim()}`;
            if (seen.has(fingerprint)) return;
            if (seen.size >= MAX_BROWSER_EXCEPTIONS_PER_SESSION) return;
            seen.add(fingerprint);

            const error = new Error(message);
            error.name = scrubText(report.name).slice(0, 100) || "Error";
            // Replaced, never appended to: the stack V8 just made for the
            // line above says nothing about the real failure.
            error.stack = stack ?? `${error.name}: ${message}`;

            const properties = {
                ...scrubContext({
                    boundary: report.boundary,
                    digest: report.digest,
                    user_id: identity.userId,
                    organization_id: identity.organizationId,
                }),
                app,
                environment,
                ...(typeof location === "undefined"
                    ? {}
                    : { route: routeTemplate(location.pathname) }),
            };
            void errorsInstance()
                .then((instance) =>
                    instance?.captureException(error, properties),
                )
                .catch(() => {
                    // The SDK failed to load or send: the console has the error.
                });
        },

        watchWindow(target) {
            const win =
                target ?? (typeof window === "undefined" ? undefined : window);
            if (!win) return;
            const from = (value: unknown): BrowserErrorReport => {
                const e =
                    typeof value === "object" && value !== null
                        ? (value as {
                              name?: unknown;
                              message?: unknown;
                              stack?: unknown;
                          })
                        : {};
                return {
                    boundary: "window",
                    name:
                        typeof e.name === "string" && e.name ? e.name : "Error",
                    message:
                        typeof e.message === "string"
                            ? e.message
                            : typeof value === "string"
                              ? value
                              : "A non-Error value was thrown",
                    ...(typeof e.stack === "string" ? { stack: e.stack } : {}),
                };
            };
            win.addEventListener("error", (event: ErrorEvent) => {
                tracking.report(from(event.error ?? event.message));
            });
            win.addEventListener(
                "unhandledrejection",
                (event: PromiseRejectionEvent) => {
                    tracking.report(from(event.reason));
                },
            );
        },

        setIdentity(ids) {
            identity = { ...ids };
        },

        async startReplay(facts) {
            const decision = replayDecision({
                ...browserPrivacySignals(),
                ...facts,
                app,
                replay: options.replay,
            });
            if (!decision.record || !options.loadRecorder || !facts.userId) {
                tracking.stopReplay();
                return false;
            }
            if (recording && replayUser === facts.userId) return true;
            const turn = ++replayTurn;
            try {
                const [loaded] = await Promise.all([
                    loadSdk(),
                    options.loadRecorder(),
                ]);
                if (turn !== replayTurn) return false;
                // One instance per page: its user is fixed when it is made.
                if (!replay || replayUser !== facts.userId) {
                    replay = loaded.init(
                        key,
                        {
                            ...replayConfig(host, facts.userId),
                            loaded: (instance: {
                                register?: (p: Record<string, unknown>) => void;
                            }) =>
                                instance.register?.({
                                    app,
                                    environment,
                                    ...(facts.organizationId
                                        ? {
                                              organization_id:
                                                  facts.organizationId,
                                          }
                                        : {}),
                                }),
                        },
                        `saroh_replay_${turn}`,
                    );
                    replayUser = facts.userId;
                }
                if (!replay) return false;
                // No override: the sample rate decides whether this session is kept.
                replay.startSessionRecording();
                recording = true;
                return true;
            } catch {
                return false;
            }
        },

        stopReplay() {
            replayTurn += 1;
            if (!recording) return;
            recording = false;
            try {
                replay?.stopSessionRecording();
            } catch {
                // Already stopped.
            }
        },
    };
    return tracking;
}
