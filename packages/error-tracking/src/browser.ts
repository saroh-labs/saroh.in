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
 * saroh.in, and session replay in two places: the workspace (Saroh's own
 * words readable, business data masked) and saroh.in (behind the cookie
 * notice). Merchant sites never import this file
 * (scripts/check-merchant-site-tracking.mjs).
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
 *  - **replay** (the workspace and saroh.in only, off unless every rule in
 *    {@link replayDecision} or {@link siteReplayDecision} holds): the
 *    recorder, with every input masked and no network or console.
 *    `before_send` drops every event that is not a recording.
 *    - Workspace ({@link replayConfig}): all text is masked but what is
 *      marked `data-ph-unmask` (Saroh's own fixed words); images, media,
 *      frames and anything marked `data-ph-block` are left out.
 *    - saroh.in ({@link siteReplayConfig}): the page's text is visible (it
 *      is Saroh's own public content); nobody is identified.
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
     * the app's own bundle. Only the workspace and saroh.in pass it.
     */
    loadRecorder?: () => Promise<unknown>;
    /** `POSTHOG_REPLAY`: replay is possible only when this is "on". */
    replay?: string | undefined;
    /** `POSTHOG_REPLAY_SAMPLE`: a share from 0 to 1, or unset for the default. */
    replaySample?: string | undefined;
}

/* ------------------------------------------------------------------ *
 * Session replay: who is recorded, and what a recording can hold
 * ------------------------------------------------------------------ */

/**
 * The share of allowed sessions that are recorded: every one (owner, 10
 * Oct). PostHog's free plan gives 5,000 recordings a month across the
 * workspace and saroh.in together; past that it stops keeping new ones until
 * the month turns. Lower it for an environment, without a release of this
 * package, with `NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE` ({@link replaySampleRate}).
 */
export const REPLAY_SAMPLE_RATE = 1;

/**
 * The sample rate to use: `POSTHOG_REPLAY_SAMPLE` when it is a number from 0
 * to 1 ("0.25" is one session in four), otherwise {@link REPLAY_SAMPLE_RATE}.
 * A value that isn't one never raises or guesses: it is ignored.
 */
export function replaySampleRate(override: string | undefined): number {
    const text = override?.trim();
    if (!text) return REPLAY_SAMPLE_RATE;
    const rate = Number(text);
    return Number.isFinite(rate) && rate >= 0 && rate <= 1
        ? rate
        : REPLAY_SAMPLE_RATE;
}

/**
 * What the recorder never draws: pictures, media, drawings, embedded pages,
 * and anything a screen marks as customer data in a form that isn't text
 * (`data-ph-block`, or the SDK's own `ph-no-capture` class). A blocked
 * element is a same-sized blank box in the recording.
 */
export const REPLAY_BLOCK_SELECTOR =
    "img, picture, video, audio, canvas, iframe, object, embed, [data-ph-block]";

/**
 * saroh.in's: its pictures and films are Saroh's own, so they are drawn.
 * Left out: embedded pages, anything a page marks as holding what a
 * visitor gave it (`data-ph-block`: a QR code made from their link, say),
 * and a picture inside text marked `data-ph-mask` (the preview image of a
 * link they checked).
 */
export const SITE_REPLAY_BLOCK_SELECTOR =
    "canvas, iframe, object, embed, [data-ph-block], [data-ph-mask] img";

/**
 * The two marks a workspace screen can carry (DEC-125, 10 Oct).
 *
 * In the workspace every character is masked unless an ancestor says the
 * words are Saroh's own, fixed ones: `data-ph-unmask` (a button's label, a
 * form label, the navigation). `data-ph-mask` says the opposite, and it
 * always wins: text under it is masked whatever stands above or below it
 * (a table cell, a customer's name inside a button).
 *
 * On saroh.in everything is readable but what is marked `data-ph-mask`.
 */
export const REPLAY_UNMASK_ATTRIBUTE = "data-ph-unmask";
export const REPLAY_MASK_ATTRIBUTE = "data-ph-mask";

type MaybeElement =
    | { closest?: (selector: string) => unknown; tagName?: string }
    | null
    | undefined;

/**
 * Whether the words inside `element` may be read in a workspace recording:
 * some ancestor (or itself) is marked `data-ph-unmask`, and none is marked
 * `data-ph-mask`. Anything it can't work out is masked.
 */
export function replayReadable(element: MaybeElement): boolean {
    try {
        if (!element || typeof element.closest !== "function") return false;
        if (element.closest(`[${REPLAY_MASK_ATTRIBUTE}]`)) return false;
        return Boolean(element.closest(`[${REPLAY_UNMASK_ATTRIBUTE}]`));
    } catch {
        return false;
    }
}

const stars = (text: string) => text.replace(/\S/gu, "*");

/**
 * The second net under readable words: every digit, and any word around an
 * `@`, is hidden even there. So an amount, a count, a date's numbers, a
 * phone number or an email that reaches a button's label by mistake still
 * can't be read ("Take ₹***", "Step * of *").
 */
export function hideFigures(text: string): string {
    // Word by word, not with one pattern around the `@`: `\S*@\S*` backtracks
    // polynomially on a long run without one (CodeQL js/polynomial-redos),
    // and this runs on every text node of a recording.
    let out = "";
    let word = "";
    const flush = () => {
        if (word) out += word.includes("@") ? stars(word) : word;
        word = "";
    };
    for (const ch of text) {
        if (/\s/u.test(ch)) {
            flush();
            out += ch;
        } else {
            word += ch;
        }
    }
    flush();
    return out.replace(/\p{Nd}/gu, "*");
}

/** The workspace's `maskTextFn`: called by the recorder for every text node. */
export function maskWorkspaceText(text: string, element?: MaybeElement) {
    return replayReadable(element) ? hideFigures(text) : stars(text);
}

/** Attributes that hold words a person reads or hears, or a typed value. */
const WORD_ATTRIBUTES = new Set([
    "title",
    "alt",
    "placeholder",
    "label",
    "value",
    "aria-label",
    "aria-description",
    "aria-valuetext",
    "aria-placeholder",
    "data-value",
    "data-label",
    "data-title",
    "data-name",
]);

/** Where a person can be sent: `<a href>`, `<area href>`, `<form action>`. */
const LINKS = new Set(["a", "area", "form"]);

/**
 * A link reduced to where it goes inside the workspace: its path, without
 * the query string or fragment (a search lives there). One that leaves the
 * workspace (a mail, a phone number, a business's own site) says nothing.
 */
function pathOnly(value: string): string {
    if (value.startsWith("#")) return value;
    try {
        const here = typeof location === "undefined" ? null : location;
        const relative = value.startsWith("/") && !value.startsWith("//");
        const url = new URL(value, here?.href ?? "https://workspace.invalid");
        if (relative) return url.pathname;
        if (url.origin === here?.origin) return `${url.origin}${url.pathname}`;
        return "#";
    } catch {
        return "#";
    }
}

/**
 * The workspace's `maskAttributeFn`. Text is not the only place a name
 * lives: `title="Asha Rao"`, `aria-label="Open Asha Rao"`, a `mailto:`
 * link, a search in a link's query string. Word attributes follow the same
 * rule as text; a link a person can follow keeps its path and nothing
 * else. What draws the page (`class`, `style`, `data-state`, a
 * stylesheet's address) is left exactly as it is.
 */
export function maskWorkspaceAttribute(
    name: string,
    value: string,
    element?: MaybeElement,
): string {
    const attribute = name.toLowerCase();
    if (WORD_ATTRIBUTES.has(attribute))
        return replayReadable(element) ? hideFigures(value) : stars(value);
    if (
        (attribute === "href" || attribute === "action") &&
        LINKS.has((element?.tagName ?? "").toLowerCase())
    )
        return pathOnly(value);
    return value;
}

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
    /**
     * Whether this person has been shown the notice that says the workspace
     * is recorded (on an earlier visit, or on this page a moment ago).
     * Nobody is recorded before they have been told.
     */
    noticeShown: boolean;
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
              | "not-told"
              | "browser-signal";
      } {
    if (facts.app !== "application")
        return { record: false, why: "not-workspace" };
    if (facts.replay !== "on") return { record: false, why: "switched-off" };
    if (!facts.inWorkspaceShell) return { record: false, why: "outside-shell" };
    if (!facts.userId) return { record: false, why: "no-user" };
    if (facts.sharesUsage !== true) return { record: false, why: "opted-out" };
    if (facts.noticeShown !== true) return { record: false, why: "not-told" };
    if (asksNotToBeTracked(facts))
        return { record: false, why: "browser-signal" };
    return { record: true };
}

function asksNotToBeTracked(
    facts: Pick<ReplayFacts, "doNotTrack" | "globalPrivacyControl">,
): boolean {
    return (
        facts.globalPrivacyControl === true ||
        facts.doNotTrack === "1" ||
        facts.doNotTrack === "yes"
    );
}

export interface SiteReplayFacts {
    /** Which app is asking. Only saroh.in ("web") may record this way. */
    app: TrackedApp;
    /** `POSTHOG_REPLAY`. */
    replay: string | undefined;
    /**
     * The visitor's answer to the cookie notice's analytics choice, the same
     * one Google Analytics waits for. Anything but "granted" is no.
     */
    consent: "granted" | "refused" | null | undefined;
    /** A Saroh team browser (`saroh_team=1`): our own visits aren't visitors. */
    teamBrowser: boolean;
    doNotTrack: string | null | undefined;
    globalPrivacyControl: boolean | undefined;
}

/**
 * Whether this visit to saroh.in may be recorded, and why not. Every rule
 * must hold; the first that fails is named.
 */
export function siteReplayDecision(facts: SiteReplayFacts):
    | { record: true }
    | {
          record: false;
          why:
              | "not-site"
              | "switched-off"
              | "team"
              | "no-consent"
              | "browser-signal";
      } {
    if (facts.app !== "web") return { record: false, why: "not-site" };
    if (facts.replay !== "on") return { record: false, why: "switched-off" };
    if (facts.teamBrowser) return { record: false, why: "team" };
    if (facts.consent !== "granted")
        return { record: false, why: "no-consent" };
    if (asksNotToBeTracked(facts))
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

/** What both recorders share: inputs masked, no network, no console. */
function recorderBasics(sampleRate: number) {
    return {
        // Every input's, textarea's and select's value, of every type.
        maskAllInputs: true,
        maskInputOptions: { password: true },
        blockClass: "ph-no-capture",
        // No request or response of the page's own is ever recorded.
        recordHeaders: false,
        recordBody: false,
        maskCapturedNetworkRequestFn: () => null,
        recordCrossOriginIframes: false,
        collectFonts: false,
        captureCanvas: { recordCanvas: false },
        // Uncompressed, so `replayBeforeSend` can strip query strings.
        compress_events: false,
        sampleRate,
        // The project's minimum length counts recorded time, not the tab's.
        strictMinimumDuration: true,
    } satisfies NonNullable<PostHogConfig["session_recording"]>;
}

/**
 * The workspace's replay instance. It does ask PostHog for the project's
 * settings (a recording starts only if the project records at all, and the
 * minimum length kept is set there), but evaluates no flag.
 *
 * **Masking.** `maskTextSelector: "*"` hands every text node to
 * `maskTextFn` ({@link maskWorkspaceText}), which is the SDK's documented
 * way to unmask selectively: a selector alone can't, because a mask on an
 * element covers its children and `:not()` therefore never unmasks. The
 * function leaves text readable only under `data-ph-unmask` and never under
 * `data-ph-mask`; digits and emails are hidden even there. Attributes go
 * through {@link maskWorkspaceAttribute}.
 */
export function replayConfig(
    host: string,
    userId: string,
    sampleRate: number = REPLAY_SAMPLE_RATE,
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
            ...recorderBasics(sampleRate),
            maskTextSelector: "*",
            maskTextFn: maskWorkspaceText,
            maskAttributeFn: maskWorkspaceAttribute,
            blockSelector: REPLAY_BLOCK_SELECTOR,
        },
        before_send: replayBeforeSend as never,
    } satisfies Partial<PostHogConfig>;
}

/**
 * saroh.in's replay instance: the page as a visitor saw it. Its text is
 * Saroh's own public content, so it is readable; every input is masked, and
 * so is anything marked `data-ph-mask` (words a visitor typed, shown back).
 * Nobody is identified: no id is handed in, none is stored
 * (`persistence: "memory"`: no cookie, no localStorage), and no person
 * profile is made. No pageview, click or other event leaves: only the
 * recording (`before_send`).
 */
export function siteReplayConfig(
    host: string,
    sampleRate: number = REPLAY_SAMPLE_RATE,
): Record<string, unknown> {
    return {
        ...everythingOff(host),
        advanced_disable_flags: false,
        disable_session_recording: true,
        person_profiles: "never",
        session_recording: {
            ...recorderBasics(sampleRate),
            maskTextSelector: `[${REPLAY_MASK_ATTRIBUTE}]`,
            blockSelector: SITE_REPLAY_BLOCK_SELECTOR,
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
    /**
     * saroh.in's: start recording if every rule holds
     * ({@link siteReplayDecision}); resolves whether it started. Call again
     * when the visitor's answer changes: anything but "granted" stops it.
     */
    startSiteReplay(
        facts: Pick<SiteReplayFacts, "consent" | "teamBrowser"> &
            Partial<
                Pick<SiteReplayFacts, "doNotTrack" | "globalPrivacyControl">
            >,
    ): Promise<boolean>;
    /**
     * Stop recording at once (the person opted out, left the shell, or took
     * their consent back).
     */
    stopReplay(): void;
}

/** saroh.in's recorder is about nobody: one instance, whoever is visiting. */
const ANONYMOUS = "";

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

    /** Load the SDK and the recorder, make the instance once, and record. */
    const begin = async (
        who: string,
        config: () => Record<string, unknown>,
    ): Promise<boolean> => {
        if (!options.loadRecorder) return false;
        if (recording && replayUser === who) return true;
        const turn = ++replayTurn;
        try {
            const [loaded] = await Promise.all([
                loadSdk(),
                options.loadRecorder(),
            ]);
            if (turn !== replayTurn) return false;
            // One instance per page: who it is about is fixed when it is made.
            if (!replay || replayUser !== who) {
                replay = loaded.init(key, config(), `saroh_replay_${turn}`);
                replayUser = who;
            }
            if (!replay) return false;
            // No override: the sample rate decides whether this session is kept.
            replay.startSessionRecording();
            recording = true;
            return true;
        } catch {
            return false;
        }
    };

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
            const userId = facts.userId;
            const sample = replaySampleRate(options.replaySample);
            return begin(userId, () => ({
                ...replayConfig(host, userId, sample),
                loaded: (instance: {
                    register?: (p: Record<string, unknown>) => void;
                }) =>
                    instance.register?.({
                        app,
                        environment,
                        ...(facts.organizationId
                            ? { organization_id: facts.organizationId }
                            : {}),
                    }),
            }));
        },

        async startSiteReplay(facts) {
            const decision = siteReplayDecision({
                ...browserPrivacySignals(),
                ...facts,
                app,
                replay: options.replay,
            });
            if (!decision.record || !options.loadRecorder) {
                tracking.stopReplay();
                return false;
            }
            const sample = replaySampleRate(options.replaySample);
            return begin(ANONYMOUS, () => ({
                ...siteReplayConfig(host, sample),
                loaded: (instance: {
                    register?: (p: Record<string, unknown>) => void;
                }) => instance.register?.({ app, environment }),
            }));
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
