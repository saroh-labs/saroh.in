import { exceptionList } from "./exception-event";
import type { TrackedApp, TrackedEnvironment } from "./names";
import {
    createRateCap,
    SEND_TIMEOUT_MS,
    trackedEnvironment,
    trackingHost,
} from "./names";
import { routeTemplate, scrubContext, scrubError } from "./scrub";

/**
 * Server-side exception reports, for code that runs on Cloudflare Workers:
 * each Next app's server (`instrumentation.ts` → `onRequestError`) and its
 * Worker's crash wrapper (`worker.ts`). One `fetch` to PostHog's capture
 * address; no SDK, no script, nothing a browser ever loads. This is the only
 * way a merchant site reports anything (DEC-125).
 *
 * Without a key it does nothing at all: no request, no timer.
 */

export interface ServerReporterOptions {
    /** The public project key (`phc_…`). Unset or empty: a no-op. */
    key: string | undefined;
    /** PostHog's address; the EU cloud when unset. */
    host?: string | undefined;
    app: TrackedApp;
    environment: TrackedEnvironment;
    /** For tests. */
    fetch?: typeof fetch;
    timeoutMs?: number;
    rateCap?: { allow(): boolean };
}

export interface ServerErrorFacts {
    /** Where it was caught: "request", "worker", … */
    source: string;
    /** The route's template (`/[domain]/products/[slug]`), when known. */
    route?: string;
    /** A raw path, reduced to a template here; used when `route` is unknown. */
    path?: string;
    method?: string;
    /** Next's error id, the reference the visitor is shown. */
    digest?: string;
    /** The site's host (merchant sites): which site, never which visitor. */
    host?: string;
    /** Whether something caught and handled it (a boundary drew a page). */
    handled?: boolean;
}

export type ServerReporter = (
    error: unknown,
    facts: ServerErrorFacts,
) => Promise<void>;

/** The body posted for one exception. Exported for tests. */
export function serverExceptionBody(
    options: Pick<ServerReporterOptions, "app" | "environment"> & {
        key: string;
    },
    error: unknown,
    facts: ServerErrorFacts,
): Record<string, unknown> {
    const scrubbed = scrubError(error);
    const route =
        facts.route ?? (facts.path ? routeTemplate(facts.path) : undefined);
    return {
        api_key: options.key,
        event: "$exception",
        // No person: a server error belongs to the app, not to a visitor.
        distinct_id: `saroh-${options.app}-server`,
        properties: {
            ...scrubContext({
                source: facts.source,
                method: facts.method,
                digest: facts.digest,
                site_host: facts.host,
            }),
            ...(route ? { route } : {}),
            app: options.app,
            environment: options.environment,
            $exception_list: exceptionList(scrubbed, facts.handled ?? false),
            $exception_level: "error",
            $process_person_profile: false,
            $geoip_disable: true,
        },
    };
}

/** Build the reporter once per Worker; call it for each error. */
export function createServerReporter(
    options: ServerReporterOptions,
): ServerReporter {
    const key = options.key?.trim();
    if (!key) return () => Promise.resolve();
    const send = options.fetch ?? fetch;
    const url = `${trackingHost(options.host)}/i/v0/e/`;
    const cap = options.rateCap ?? createRateCap();
    const { app, environment } = options;
    return async (error, facts) => {
        try {
            if (!cap.allow()) return;
            await send(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                    serverExceptionBody(
                        { key, app, environment },
                        error,
                        facts,
                    ),
                ),
                signal: AbortSignal.timeout(
                    options.timeoutMs ?? SEND_TIMEOUT_MS,
                ),
            });
        } catch {
            // PostHog slow or down: the error is already in our own log.
        }
    };
}

/* ------------------------------------------------------------------ *
 * The two places a Next app on a Worker calls this from
 * ------------------------------------------------------------------ */

/** An app's own settings, read from its env module or its Worker's vars. */
export interface AppTrackingSettings {
    key: string | undefined;
    host?: string | undefined;
    app: TrackedApp;
    /** The Worker's `VERCEL_ENV` marker: only "production" is production. */
    vercelEnv: string | undefined;
    /**
     * Merchant sites only: also say which site's host it happened on. The
     * site, never the visitor.
     */
    siteHost?: boolean;
    /** For tests. */
    fetch?: typeof fetch;
}

/** One reporter (and one rate cap) per app and key in each isolate. */
const reporters = new Map<string, ServerReporter>();

function reporterFor(settings: AppTrackingSettings): ServerReporter {
    const id = [
        settings.app,
        settings.key ?? "",
        settings.host ?? "",
        settings.vercelEnv ?? "",
    ].join("|");
    let reporter = settings.fetch ? undefined : reporters.get(id);
    if (!reporter) {
        reporter = createServerReporter({
            key: settings.key,
            host: settings.host,
            app: settings.app,
            environment: trackedEnvironment(settings.vercelEnv),
            fetch: settings.fetch,
        });
        if (!settings.fetch) reporters.set(id, reporter);
    }
    return reporter;
}

function digestOf(error: unknown): string | undefined {
    const digest =
        typeof error === "object" && error !== null
            ? (error as { digest?: unknown }).digest
            : undefined;
    return typeof digest === "string" ? digest : undefined;
}

/** One header's first value, whatever shape the framework gives it. */
function headerOf(
    headers: Record<string, string | string[] | undefined>,
    name: string,
): string | undefined {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
}

/**
 * For `instrumentation.ts`:
 * `export const onRequestError = (error, request, context) =>
 *      reportRequestError(error, request, context, settings)`.
 *
 * Next hands over the request's path, method and headers; this keeps the
 * route's template (`context.routePath`), the method, Next's digest and,
 * for a merchant site, the site's host. Never the path asked for, a header
 * or a cookie. Await it: a Worker stops when the response is done.
 */
export function reportRequestError(
    error: unknown,
    request: {
        path?: string;
        method?: string;
        headers?: Record<string, string | string[] | undefined>;
    },
    context: { routePath?: string; routeType?: string },
    settings: AppTrackingSettings,
): Promise<void> {
    if (!settings.key) return Promise.resolve();
    return reporterFor(settings)(error, {
        source: context.routeType ? `request:${context.routeType}` : "request",
        route: context.routePath,
        path: request.path,
        method: request.method,
        digest: digestOf(error),
        ...(settings.siteHost && request.headers
            ? { host: headerOf(request.headers, "host") }
            : {}),
        // A boundary drew a page for it.
        handled: true,
    });
}

/**
 * For `worker.ts`: `withCrashPage(…, { report: (error, { request, env }) =>
 * reportWorkerCrash(error, request, settings) })`. The handler threw before
 * Next could render anything, so no route is known: the path is reduced to
 * a template, and its query string never leaves.
 */
export function reportWorkerCrash(
    error: unknown,
    request: { url: string; method: string },
    settings: AppTrackingSettings,
): Promise<void> {
    if (!settings.key) return Promise.resolve();
    let path: string | undefined;
    let host: string | undefined;
    try {
        const url = new URL(request.url);
        path = url.pathname;
        host = url.hostname;
    } catch {
        // No address to speak of.
    }
    return reporterFor(settings)(error, {
        source: "worker",
        path,
        method: request.method,
        ...(settings.siteHost && host ? { host } : {}),
        handled: false,
    });
}
