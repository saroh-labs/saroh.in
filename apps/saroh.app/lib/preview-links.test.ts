import { describe, expect, it, vi } from "vitest";

import { KEEP_LINKS_INSIDE } from "./preview-links";

const BASE = "/preview/tok";

/** Run the script against a stand-in page and hand back its click handler. */
function install() {
    const got: { handler?: (e: unknown) => void } = {};
    const assign = vi.fn();
    const document = {
        currentScript: { getAttribute: () => BASE },
        addEventListener: (_: string, fn: (e: unknown) => void) => {
            got.handler = fn;
        },
    };
    const window = { location: { assign } };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script under test is a constant string
    const run = new Function("document", "window", KEEP_LINKS_INSIDE) as (
        d: unknown,
        w: unknown,
    ) => void;
    run(document, window);
    if (!got.handler) throw new Error("no click handler");
    return { click: got.handler, assign };
}

function link(href: string, target: string | null = null) {
    const attrs: Record<string, string | null> = { href, target };
    return {
        getAttribute: (k: string) => attrs[k] ?? null,
        setAttribute: (k: string, v: string) => {
            attrs[k] = v;
        },
        attrs,
    };
}

function event(a: ReturnType<typeof link>, over: Record<string, unknown> = {}) {
    return {
        target: { closest: () => a },
        button: 0,
        defaultPrevented: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ...over,
    };
}

describe("draft preview links (UX-069)", () => {
    it("takes a plain click on a section's /about to the preview's /about", () => {
        const { click, assign } = install();
        const a = link("/about");
        const e = event(a);
        click(e);
        expect(a.attrs.href).toBe(`${BASE}/about`);
        // A next/link routes by its own prop: the script navigates itself.
        expect(e.preventDefault).toHaveBeenCalled();
        expect(e.stopPropagation).toHaveBeenCalled();
        expect(assign).toHaveBeenCalledWith(`${BASE}/about`);
    });

    it("leaves a modified click to the browser, on the rewritten address", () => {
        const { click, assign } = install();
        const a = link("/about");
        const e = event(a, { metaKey: true });
        click(e);
        expect(a.attrs.href).toBe(`${BASE}/about`);
        expect(assign).not.toHaveBeenCalled();
        expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it("never touches outside links or ones already in the preview", () => {
        const { click, assign } = install();
        for (const href of [
            "https://example.com/",
            "//cdn.example.com/x",
            "tel:+910000000000",
            `${BASE}/blog`,
            "#top",
        ]) {
            const a = link(href);
            click(event(a));
            expect(a.attrs.href).toBe(href);
        }
        expect(assign).not.toHaveBeenCalled();
    });

    it("lets a link that opens a new tab do so", () => {
        const { click, assign } = install();
        const a = link("/menu", "_blank");
        click(event(a));
        expect(a.attrs.href).toBe(`${BASE}/menu`);
        expect(assign).not.toHaveBeenCalled();
    });
});
