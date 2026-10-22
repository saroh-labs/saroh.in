/**
 * "Nothing here" in one line is the empty card at its smallest (UX audit,
 * 10 Oct 2026). About thirty tabs, sheets, pickers and rails each printed a
 * bare "No X" sentence in a paragraph of their own type size. They are
 * `EmptyState size="inline"` now: a title, and one line where the reader's
 * role has a next step. No size was added: `inline` fits a table cell, a
 * rail and a menu.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { EmptyState } from "@saroh/ui/data-state";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(""),
}));

import { ReleaseLinks } from "@/components/sites/test-releases/release-links";

const APP = join(__dirname, "..", "..", "..");

const html = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>).replace(/&#x27;/g, "'");

describe("the empty card in one line", () => {
    it("is a sentence, then the one line, with no box", () => {
        const markup = html(
            <EmptyState
                size="inline"
                title="No values yet"
                description="Edit it to add some."
            />,
        );
        expect(markup).toContain('data-state="empty"');
        expect(markup).toContain('data-state-size="inline"');
        expect(markup).toContain("No values yet.");
        expect(markup).toContain("Edit it to add some.");
        expect(markup).not.toContain("border-dashed");
    });

    it("names what was searched for when a search left nothing", () => {
        const markup = html(
            <EmptyState
                size="inline"
                kind="no-results"
                things="products"
                query="rye"
            />,
        );
        expect(markup).toContain('data-state="no-results"');
        expect(markup).toContain("No products match “rye”.");
    });
});

describe("a call site: a test release's links", () => {
    const links = (canShare: boolean) =>
        html(
            <ReleaseLinks
                {...({
                    siteId: "site_1",
                    release: { id: "rel_1", links: [] },
                    zone: "Asia/Kolkata",
                    onChanged: () => undefined,
                    canShare,
                } as unknown as Parameters<typeof ReleaseLinks>[0])}
            />,
        );

    it("offers the next step only to someone who may take it", () => {
        expect(links(true)).toContain("No link works right now.");
        expect(links(true)).toContain("Make one to share it.");
        expect(links(false)).toContain("No link works right now.");
        expect(links(false)).not.toContain("Make one to share it.");
        expect(links(false)).toContain('data-state="empty"');
    });
});

describe("no tab, sheet or picker prints a bare empty sentence", () => {
    function sources(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) return sources(path);
            return name.endsWith(".tsx") && !name.includes(".test.")
                ? [path]
                : [];
        });
    }

    /**
     * A paragraph, a span or a list item whose whole text starts "No …",
     * "Nothing …" or "None …": the shape the bare empties had.
     */
    const BARE =
        /<(p|li)\b[^>]*text-muted-foreground[^>]*>\s*(No|Nothing|None)\b[^<{]*<\/\1>/g;

    /** Not a list with nothing in it, each with what it is instead. */
    const KEPT: Record<string, string> = {
        "components/modules/turn-on/turn-on-sheet.tsx":
            "a step with nothing to fill in, not an empty list",
        "components/bookings/booking-page/pay-link-panel.tsx":
            "why a plan made no payment link, not an empty list",
        "components/commerce/product-page/review-list.tsx":
            "a review left without words: a value",
        "components/customers/detail/reviews-tab.tsx":
            "a review left without words: a value",
        "components/sites/canvas/editor-canvas.tsx":
            "what a failed save left as it was, and the canvas's own hint",
    };

    it("outside the ones that are something else", () => {
        const found = [
            ...sources(join(APP, "app")),
            ...sources(join(APP, "components")),
        ]
            .map((path) => relative(APP, path))
            .filter((file) => !(file in KEPT))
            .flatMap((file) => {
                const source = readFileSync(join(APP, file), "utf8");
                const hits: string[] = [];
                for (let m = BARE.exec(source); m; m = BARE.exec(source)) {
                    hits.push(
                        `${file}: ${source
                            .slice(m.index, m.index + 110)
                            .replace(/\s+/g, " ")}`,
                    );
                }
                return hits;
            });
        expect(found).toEqual([]);
    });
});
