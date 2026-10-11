import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SettingsLoading } from "@/components/settings/settings-loading";
import { SETTINGS_ROWS } from "@/components/settings/settings-panel";

import type { PageShape, PageWidth } from "./page-loading";
import { ArrivalLoading, PageLoading } from "./page-loading";

/**
 * The one loading shell. What it must hold still: the page's container and
 * width, its real header, and one way of telling a screen reader.
 */
const SHAPES: PageShape[] = [
    "list",
    "detail",
    "form",
    "editor",
    "dashboard",
    "settings",
];

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("PageLoading", () => {
    it.each(SHAPES)("draws the %s shape, said once and busy", (shape) => {
        const html = renderToStaticMarkup(
            <PageLoading
                shape={shape}
                width="full"
                title="Orders"
                label="Loading orders"
            />,
        );
        expect(html).toContain(`data-shape="${shape}"`);
        expect(count(html, 'role="status"')).toBe(1);
        expect(count(html, 'aria-busy="true"')).toBe(1);
        expect(count(html, "Loading orders")).toBe(1);
        // The grey is one drawing, and hidden from a screen reader.
        expect(html).toContain("skeleton-sweep");
        expect(html).not.toContain("animate-pulse");
        expect(html).not.toContain("animate-spin");
        expect(html).toMatch(
            /<span class="sr-only">Loading orders<\/span><div aria-hidden="true">/,
        );
    });

    it("draws the page's real header: breadcrumb and title", () => {
        const html = renderToStaticMarkup(
            <PageLoading
                shape="list"
                width="full"
                breadcrumb={["Sell", "Orders"]}
                title="Orders"
                label="Loading orders"
            />,
        );
        expect(html).toContain('aria-label="Breadcrumb"');
        expect(html).toMatch(/<h1[^>]*>Orders<\/h1>/);
        // The header is outside the busy region: it has already arrived.
        expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('role="status"'));
    });

    it("stands a bar in the title's place when the route can't know it", () => {
        const html = renderToStaticMarkup(
            <PageLoading
                shape="detail"
                width="full"
                breadcrumb={["Sell", "Orders"]}
                label="Loading the order"
            />,
        );
        // The heading still has a name for a screen reader.
        expect(html).toMatch(
            /<h1[^>]*><span class="sr-only">Loading the order<\/span>/,
        );
    });

    it.each([
        ["form", "max-w-2xl"],
        ["default", "max-w-5xl"],
        ["wide", "max-w-7xl"],
    ] as [PageWidth, string][])(
        "sits in the page container at the %s width, left-aligned",
        (width, cls) => {
            const html = renderToStaticMarkup(
                <PageLoading shape="form" width={width} title="New" />,
            );
            expect(html).toMatch(new RegExp(`<main class="[^"]*${cls}`));
            expect(html).not.toContain("mx-auto");
        },
    );

    it("takes the whole work area at the full width", () => {
        const html = renderToStaticMarkup(
            <PageLoading shape="list" width="full" title="Orders" />,
        );
        expect(html).toMatch(/<main class="[^"]*sm:px-\[26px\]/);
        expect(html).not.toMatch(/<main class="[^"]*max-w-/);
    });

    it("draws the tabs' labels without counts, and inert", () => {
        const html = renderToStaticMarkup(
            <PageLoading
                shape="list"
                width="full"
                title="Orders"
                tabs={["All", "Open", "Refunded"]}
            />,
        );
        expect(html).toMatch(/<div inert=""[^>]*data-slot="page-loading-tabs"/);
        expect(html).toContain("Refunded");
        expect(html).not.toMatch(/>\d+</);
    });

    it("draws a route's real tab strip as given, inert", () => {
        const html = renderToStaticMarkup(
            <PageLoading
                shape="list"
                width="full"
                title="Class packs"
                tabs={<nav aria-label="Class packs">Packs</nav>}
            />,
        );
        expect(html).toMatch(
            /<div inert=""[^>]*><nav aria-label="Class packs">Packs<\/nav>/,
        );
    });

    it("draws only the body inside a layout that drew the header", () => {
        const html = renderToStaticMarkup(
            <PageLoading
                bare
                shape="list"
                width="full"
                label="Loading this tab"
            />,
        );
        expect(html).not.toContain("<main");
        expect(html).not.toContain("<h1");
        expect(html).toContain('role="status"');
        expect(html).toContain("Loading this tab");
    });

    it("says no empty or failed words while it loads", () => {
        for (const shape of SHAPES) {
            const html = renderToStaticMarkup(
                <PageLoading shape={shape} width="full" title="Orders" />,
            );
            expect(html).not.toMatch(/No \w+ yet|Couldn|Try again/);
        }
    });
});

describe("SettingsLoading", () => {
    it("keeps the section's title and breadcrumb, at the rows measure", () => {
        const html = renderToStaticMarkup(
            <SettingsLoading title="Activity" rows={3} />,
        );
        expect(html).toMatch(/<h1[^>]*>Activity<\/h1>/);
        expect(html).toContain('aria-current="page"');
        expect(html).toContain('data-shape="settings"');
        expect(html).toContain(SETTINGS_ROWS.split(" ")[0]);
        expect(html).toContain("Loading Activity");
    });

    it("takes the panel for a section that is a table", () => {
        const html = renderToStaticMarkup(
            <SettingsLoading title="Team" width="full" />,
        );
        expect(html).not.toContain("max-w-[760px]");
    });
});

describe("ArrivalLoading", () => {
    it("is a centred card, said the same way as every loader", () => {
        const html = renderToStaticMarkup(<ArrivalLoading label="Joining" />);
        expect(html).toContain("mx-auto");
        expect(count(html, 'role="status"')).toBe(1);
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain("Joining");
    });
});
