/**
 * The page a visitor sees when nothing else can draw one: Next's
 * `global-error.tsx` (the root layout itself threw, so no stylesheet, font or
 * token is loaded) and the Worker's own fallback (`withCrashPage`, the
 * OpenNext handler threw before Next could render anything).
 *
 * It keeps the shape of `@saroh/ui/not-found` and `@saroh/ui/error-page` —
 * mono eyebrow, display heading, one sentence, the way on — but carries its
 * own CSS in one small `<style>`, because there is no CSS to rely on. Values
 * restate `packages/ui/src/globals.css` (Paper, Ink, Saffron) and, for
 * `neutral`, the `SiteTheme` stone defaults: a merchant site's crash page
 * must never show Saroh's brand (AGENTS.md), and with the site's palette
 * unknown, the neutral ground is the honest one.
 *
 * No script: "Try again" on the Worker's page is a link to the same address,
 * so it works with JavaScript off or broken. Nothing about the error is ever
 * printed — only, on a Next page, the digest the server logged it under.
 */

import {
    SYMBOL_PATH,
    WORDMARK_PATH,
    WORDMARK_VIEWBOX,
} from "./wordmark-geometry";

/** Whose page this is: Saroh's own apps, or a merchant's site (unbranded). */
export type CrashBrand = "saroh" | "neutral";

export interface CrashCopy {
    eyebrow: string;
    title: string;
    description: string;
}

/** The words when the caller has none of its own. */
export const CRASH_COPY: Record<CrashBrand, CrashCopy> = {
    saroh: {
        eyebrow: "500",
        title: "Something went wrong",
        description:
            "This page didn’t load. It’s usually temporary, so try again in a moment.",
    },
    neutral: {
        eyebrow: "Something went wrong",
        title: "This page isn’t loading",
        description: "It’s usually temporary, so try again in a moment.",
    },
};

/*
 * Colours as HSL triplets, the globals.css way. Light first, then the
 * visitor's dark preference. `neutral` is SiteTheme's no-palette ground.
 */
const PALETTES: Record<
    CrashBrand,
    Record<"light" | "dark", Record<string, string>>
> = {
    saroh: {
        light: {
            bg: "40 31% 94%",
            fg: "60 4% 11%",
            body: "42 9% 39%",
            eyebrow: "33 85% 31%",
            border: "45 11% 71%",
            highlight: "36 82% 47%",
        },
        dark: {
            bg: "60 5% 7%",
            fg: "40 31% 94%",
            body: "41 10% 69%",
            eyebrow: "38 87% 55%",
            border: "51 5% 28%",
            highlight: "38 87% 55%",
        },
    },
    neutral: {
        light: {
            bg: "0 0% 100%",
            fg: "24 10% 10%",
            body: "24 6% 34%",
            eyebrow: "24 4.9% 55.9%",
            border: "24 1.1% 90.1%",
            highlight: "24 10% 10%",
        },
        dark: {
            bg: "0 0% 0%",
            fg: "0 0% 100%",
            body: "0 0% 78%",
            eyebrow: "24 4.9% 55.9%",
            border: "24 6% 20%",
            highlight: "0 0% 100%",
        },
    },
};

function vars(palette: Record<string, string>): string {
    return Object.entries(palette)
        .map(([name, value]) => `--crash-${name}:${value};`)
        .join("");
}

/**
 * The page's stylesheet, scoped to `.saroh-crash` so it can also sit inside
 * an app that has its own (help and docs, which have no Tailwind build for
 * `@saroh/ui`). `--foreground` and `--highlight` are set too, so the inline
 * `<Wordmark>` draws in the page's ink and Saffron.
 */
export function crashPageCss(brand: CrashBrand): string {
    const { light, dark } = PALETTES[brand];
    const saroh = brand === "saroh";
    const sans = saroh
        ? "var(--font-sans, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)"
        : "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    const display = saroh ? `var(--font-display, ${sans})` : sans;
    return [
        `.saroh-crash{${vars(light)}--foreground:var(--crash-fg);--highlight:var(--crash-highlight);box-sizing:border-box;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:64px 16px;background:hsl(var(--crash-bg));color:hsl(var(--crash-body));font-family:${sans};-webkit-font-smoothing:antialiased;text-align:center}`,
        `@media (prefers-color-scheme:dark){.saroh-crash{${vars(dark)}}}`,
        // Inside another app's page (help, docs): no full-screen ground.
        ".saroh-crash.crash-inline{min-height:60vh;background:transparent}",
        ".saroh-crash *{box-sizing:border-box}",
        ".saroh-crash section{width:100%;max-width:34rem;display:flex;flex-direction:column;align-items:center;gap:12px}",
        ".saroh-crash .crash-mark{margin-bottom:20px;font-size:1.25rem}",
        ".saroh-crash .crash-eyebrow{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:600;line-height:1;letter-spacing:0.1em;text-transform:uppercase;color:hsl(var(--crash-eyebrow))}",
        `.saroh-crash h1{margin:0;font-family:${display};font-size:28px;font-weight:600;line-height:1.15;letter-spacing:-0.03em;color:hsl(var(--crash-fg));text-wrap:balance}`,
        ".saroh-crash .crash-sentence{margin:0;max-width:44ch;font-size:15px;line-height:1.6;text-wrap:pretty}",
        ".saroh-crash .crash-ref{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:hsl(var(--crash-body))}",
        ".saroh-crash .crash-actions{margin-top:16px;width:100%;display:flex;flex-direction:column;align-items:stretch;gap:8px}",
        ".saroh-crash .crash-action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:10px;border:1px solid hsl(var(--crash-fg));background:hsl(var(--crash-fg));color:hsl(var(--crash-bg));font:inherit;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}",
        ".saroh-crash .crash-action.secondary{background:transparent;color:hsl(var(--crash-fg));border-color:hsl(var(--crash-border))}",
        ".saroh-crash .crash-action:focus-visible{outline:2px solid hsl(var(--crash-fg));outline-offset:2px}",
        "@media (min-width:640px){.saroh-crash h1{font-size:34px}.saroh-crash .crash-actions{width:auto;flex-direction:row;justify-content:center}.saroh-crash .crash-action{min-height:40px}}",
    ].join("\n");
}

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** The lockup as plain SVG, the same geometry `<Wordmark>` draws. */
function wordmarkSvg(): string {
    return (
        `<span role="img" aria-label="Saroh" style="display:inline-flex;align-items:center;gap:0.388em;line-height:1">` +
        `<svg width="1.385em" height="1.385em" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">` +
        `<path d="${SYMBOL_PATH}" stroke="hsl(var(--crash-fg))" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="50" cy="48" r="5.6" fill="hsl(var(--crash-highlight))"/></svg>` +
        `<svg viewBox="${WORDMARK_VIEWBOX}" style="height:0.769em;width:auto" aria-hidden="true" focusable="false">` +
        `<path d="${WORDMARK_PATH}" fill="hsl(var(--crash-fg))"/></svg></span>`
    );
}

export interface CrashPageHtmlOptions extends Partial<CrashCopy> {
    brand: CrashBrand;
    /** Where "Back to home" goes; omit on a host with no home to go to. */
    homeHref?: string;
    homeLabel?: string;
}

/**
 * The whole static document the Worker returns when its handler threw.
 * Self-contained: no request for a stylesheet, font or script.
 */
export function crashPageHtml(options: CrashPageHtmlOptions): string {
    const copy = { ...CRASH_COPY[options.brand], ...stripUndefined(options) };
    const home = options.homeHref
        ? `<a class="crash-action secondary" href="${escapeHtml(options.homeHref)}">${escapeHtml(options.homeLabel ?? "Back to home")}</a>`
        : "";
    const mark =
        options.brand === "saroh"
            ? `<div class="crash-mark">${wordmarkSvg()}</div>`
            : "";
    return (
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="robots" content="noindex">` +
        `<title>${escapeHtml(copy.title)}</title>` +
        `<style>html,body{margin:0}${crashPageCss(options.brand)}</style></head>` +
        `<body><main class="saroh-crash"><section aria-labelledby="crash-title">` +
        mark +
        `<p class="crash-eyebrow">${escapeHtml(copy.eyebrow)}</p>` +
        `<h1 id="crash-title">${escapeHtml(copy.title)}</h1>` +
        `<p class="crash-sentence">${escapeHtml(copy.description)}</p>` +
        `<div class="crash-actions"><a class="crash-action" href="">Try again</a>${home}</div>` +
        `</section></main></body></html>`
    );
}

function stripUndefined(options: Partial<CrashCopy>): Partial<CrashCopy> {
    const out: Partial<CrashCopy> = {};
    if (options.eyebrow !== undefined) out.eyebrow = options.eyebrow;
    if (options.title !== undefined) out.title = options.title;
    if (options.description !== undefined)
        out.description = options.description;
    return out;
}

type Fetch<Env, Ctx> = (
    request: Request,
    env: Env,
    ctx: Ctx,
) => Response | Promise<Response>;

export interface WithCrashPageOptions<
    Env = unknown,
    Ctx = unknown,
> extends CrashPageHtmlOptions {
    /** One line for Workers Logs; the visitor never sees the error. */
    log?: (detail: {
        event: "worker_crashed";
        path: string;
        error: string;
    }) => void;
    /**
     * Send the error to the error tracker (DEC-123). Handed the error and
     * the request as they are: what leaves is the reporter's to scrub
     * (`@saroh/error-tracking/server`). The crash page never waits for it:
     * a promise it returns is given to `ctx.waitUntil`, and whatever it
     * throws is dropped.
     */
    report?: (
        error: unknown,
        at: { request: Request; env: Env; ctx: Ctx },
    ) => void | Promise<void>;
}

/**
 * Wrap a Worker's `fetch` so an exception that escapes it becomes this page
 * with a 500, instead of Cloudflare's own "Worker threw exception" screen.
 *
 * What it can't catch: a Worker that runs out of CPU or memory (the runtime
 * stops it, no code runs after), an error after a streamed response has
 * started (its status is already sent), and anything in front of the Worker
 * (an unreachable host, a Cloudflare outage). Next's own failures never get
 * here: Next renders them with the app's `error.tsx` / `global-error.tsx`.
 */
export function withCrashPage<Env, Ctx>(
    fetch: Fetch<Env, Ctx>,
    options: WithCrashPageOptions<Env, Ctx>,
): (request: Request, env: Env, ctx: Ctx) => Promise<Response> {
    const html = crashPageHtml(options);
    return async (request, env, ctx) => {
        try {
            return await fetch(request, env, ctx);
        } catch (error) {
            const detail = {
                event: "worker_crashed" as const,
                // The path only: a query string can carry a token or an email.
                path: new URL(request.url).pathname,
                error:
                    error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : String(error),
            };
            if (options.log) options.log(detail);
            else console.error(JSON.stringify(detail));
            if (options.report) {
                try {
                    const sending = options.report(error, {
                        request,
                        env,
                        ctx,
                    });
                    if (sending instanceof Promise) {
                        const quiet = sending.catch(() => undefined);
                        (
                            ctx as { waitUntil?: (p: Promise<unknown>) => void }
                        ).waitUntil?.(quiet);
                    }
                } catch {
                    // The tracker failing is never the visitor's problem.
                }
            }
            return new Response(request.method === "HEAD" ? null : html, {
                status: 500,
                headers: {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "no-store",
                    "x-robots-tag": "noindex",
                },
            });
        }
    };
}
