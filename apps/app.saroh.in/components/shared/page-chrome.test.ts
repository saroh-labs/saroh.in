import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Two rules every screen under the shell keeps, read from the source so a
 * new screen can't arrive without them:
 *
 * 1. A page that draws something has a `loading.tsx` of its own shape, at
 *    the width the page sits at. A loader narrower or wider than its page
 *    makes the content jump sideways when it lands.
 * 2. A page's title is drawn by `PageHeader` and nothing else: no
 *    hand-written `<h1>`.
 */
const APP = path.resolve(__dirname, "../..");
const SHELL = path.join(APP, "app", "(shell)");

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const rel = (file: string) => path.relative(SHELL, file) || ".";

/**
 * Pages whose container is drawn by their own component or by the layout
 * above them, so the page file names no width. Each says where it is drawn.
 */
const DRAWN_ELSEWHERE: Record<string, string> = {
    // `EditorShell` draws the page's one <main>, edge to edge.
    "billing/plans/[planId]/edit": "full",
    "class-packs/[packId]/edit": "full",
    "class-packs/new": "full",
    // `BookingDetail` draws its own `PageContainer`.
    "bookings/[bookingId]": "default",
    // Order Detail and the tickets draw their own <main> at the full width.
    "commerce/orders/[orderId]": "full",
    "commerce/orders/tickets": "full",
    // The product page and its editor are edge to edge by design (#523).
    "commerce/products/[productId]": "full",
    "commerce/products/[productId]/edit": "full",
    // The editor is the page; `form` is only its two refusals.
    "commerce/products/new": "full",
    // The Service Editor draws the page's one <main>.
    "services/[serviceId]": "full",
    "services/new": "full",
    // The tabs' layout draws the container, the header and the tabs.
    "sites/[siteId]/(tabs)/forms": "full",
    "sites/[siteId]/(tabs)/forms/[formId]": "full",
    "sites/[siteId]/(tabs)/pages": "full",
    "sites/[siteId]/(tabs)/posts": "full",
    "sites/[siteId]/(tabs)/review": "full",
    // The post editor owns its viewport.
    "sites/[siteId]/posts/[postId]": "full",
    "sites/[siteId]/posts/new": "full",
};

/** The two arrival screens: a centred card, not a screen of the workspace. */
const ARRIVALS = new Set(["join/[token]", "invitations/[token]"]);

/** A page that only ever redirects draws nothing to stand in for. */
const draws = (source: string) => /return\s*\(?\s*</.test(source);

function pageWidths(dir: string, source: string): string[] {
    const key = rel(dir);
    if (ARRIVALS.has(key)) return ["arrival"];
    if (DRAWN_ELSEWHERE[key]) return [DRAWN_ELSEWHERE[key]];
    if (source.includes("SettingsPanel")) return ["settings"];
    const widths: string[] = [];
    const tags = /<PageContainer([^>]*)>/g;
    for (let tag = tags.exec(source); tag; tag = tags.exec(source)) {
        const width = /width="(\w+)"/.exec(tag[1])?.[1] ?? "default";
        if (!widths.includes(width)) widths.push(width);
    }
    return widths;
}

function loaderFor(dir: string): string | null {
    let at = dir;
    for (;;) {
        const file = path.join(at, "loading.tsx");
        if (existsSync(file)) return file;
        if (at === SHELL) return null;
        at = path.dirname(at);
    }
}

function loaderWidth(source: string): string | null {
    if (source.includes("<SettingsLoading")) return "settings";
    if (source.includes("<ArrivalLoading")) return "arrival";
    // The shell's own loader is `PageLoading` named for the address.
    return (
        /<(?:PageLoading|ShellLoading)[^>]*?\bwidth="(\w+)"/.exec(
            source,
        )?.[1] ?? null
    );
}

const pages = walk(SHELL)
    .filter((f) => path.basename(f) === "page.tsx")
    .map((file) => ({
        dir: path.dirname(file),
        source: readFileSync(file, "utf8"),
    }))
    .filter((p) => draws(p.source));

describe("every page under the shell has a loader of its own width", () => {
    it("finds the pages", () => {
        expect(pages.length).toBeGreaterThan(50);
    });

    it.each(pages.map((p) => [rel(p.dir), p] as const))("%s", (name, page) => {
        const widths = pageWidths(page.dir, page.source);
        expect(
            widths,
            `${name}/page.tsx names no PageContainer width: add it to DRAWN_ELSEWHERE with where its container is drawn`,
        ).not.toHaveLength(0);

        const loader = loaderFor(page.dir);
        if (!loader) throw new Error(`${name} has no loading.tsx`);
        // The shell's loader is shown first on every move between
        // sections, named for the address; no page may have only that.
        if (name !== ".") {
            expect(
                path.dirname(loader),
                `${name} falls back to Home's loader: give it a loading.tsx`,
            ).not.toBe(SHELL);
        }
        const width = loaderWidth(readFileSync(loader, "utf8"));
        expect(
            widths,
            `${rel(loader)} is ${width ?? "not a PageLoading"}, but ${name} sits at ${widths.join(" or ")}`,
        ).toContain(width);
    });

    it("draws every loader with the one loading shell", () => {
        const loaders = walk(path.join(APP, "app")).filter(
            (f) => path.basename(f) === "loading.tsx",
        );
        expect(loaders.length).toBeGreaterThan(50);
        // The first-run split is its own two-pane frame, outside the shell.
        const own = new Set(["app/onboarding/loading.tsx"]);
        const handBuilt = loaders
            .map((f) => path.relative(APP, f))
            .filter((f) => !own.has(f))
            .filter(
                (f) =>
                    !/<(PageLoading|ShellLoading|SettingsLoading|ArrivalLoading)\b/.test(
                        readFileSync(path.join(APP, f), "utf8"),
                    ),
            );
        expect(handBuilt).toEqual([]);
    });

    it("draws no loader by hand: no pulse, no bare grey block", () => {
        const offenders = walk(path.join(APP, "app"))
            .concat(walk(path.join(APP, "components")))
            .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
            .filter((f) => readFileSync(f, "utf8").includes("animate-pulse"))
            .map((f) => path.relative(APP, f));
        expect(offenders).toEqual([]);
    });
});

describe("a page's title is the page header's", () => {
    /**
     * The only hand-written `<h1>`s, each not a workspace page's title.
     */
    const ALLOWED = new Set([
        // The post as its readers see it: the article's own title.
        "components/sites/post-read-view.tsx",
        // A full-screen review over the editor, with its own bar.
        "components/sites/pre-publish-check.tsx",
        // That review's finished state, in the same bar.
        "components/sites/went-live.tsx",
        // Setup, outside the workspace: each step's question is the
        // split screen's title, as `app/onboarding/page.tsx` drew it.
        "components/organizations/setup-step-frame.tsx",
        // Bookings' calendar: header C's date is the page's title and the
        // button that opens Go to a day (bookings U2, #1018).
        "components/bookings/calendar/header/calendar-header.tsx",
        // The Calendar month: the month between ‹ and › is the page's
        // title, in the row that moves it (bookings U13, #1029).
        "components/calendar/month-toolbar.tsx",
    ]);

    it("has no hand-written <h1> under the shell or in components", () => {
        const files = walk(SHELL)
            .concat(walk(path.join(APP, "components")))
            .filter((f) => f.endsWith(".tsx") && !f.includes(".test."));
        const offenders = files
            .filter((f) => /<h1[\s>]/.test(readFileSync(f, "utf8")))
            .map((f) => path.relative(APP, f))
            .filter((f) => !ALLOWED.has(f));
        expect(
            offenders,
            "draw the page's title with PageHeader (@saroh/ui/page-header)",
        ).toEqual([]);
    });

    it("draws no breadcrumb by hand", () => {
        const files = walk(SHELL)
            .concat(walk(path.join(APP, "components")))
            .filter((f) => f.endsWith(".tsx") && !f.includes(".test."));
        const offenders = files
            .filter((f) =>
                readFileSync(f, "utf8").includes('aria-label="Breadcrumb"'),
            )
            .map((f) => path.relative(APP, f))
            // The site editor is outside the shell and draws its own bar.
            .filter((f) => f !== "components/sites/editor/editor-top-bar.tsx");
        expect(
            offenders,
            "pass the crumbs to PageHeader's `breadcrumb`",
        ).toEqual([]);
    });
});
