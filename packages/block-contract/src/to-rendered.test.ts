import { describe, expect, it } from "vitest";

import { pagePathResolver, toRendered } from "./to-rendered";

/**
 * Gate G7 (#252) — the editor's resolution and publish's must agree.
 *
 * This is the gate that guards what Step 4 actually introduced. After the merge
 * the site editor and the live site share one set of components, so they cannot
 * disagree about DRAWING. But the draft→rendered resolution now runs in two
 * places — client-side in the editor to build its preview, server-side at
 * publish to build the snapshot — and those can still drift apart.
 *
 * That is the #189 failure mode at its actual source: a preview that honours
 * something the published page does not. Sharing one `toRendered` is the fix;
 * these are the tests that say it stayed shared.
 */
describe("toRendered", () => {
    const pages = [
        { id: "p1", path: "/" },
        { id: "p2", path: "/about" },
    ];
    const resolvePage = pagePathResolver(pages);

    it("resolves a hero's nested button to the path publish would write", () => {
        const out = toRendered(
            "hero",
            {
                heading: "Hi",
                cta: { label: "About", action: { kind: "page", pageId: "p2" } },
            },
            { resolvePage },
        ) as { cta: { href: string } };
        expect(out.cta.href).toBe("/about");
    });

    it("resolves a standalone cta block", () => {
        const out = toRendered(
            "cta",
            {
                label: "Call",
                action: { kind: "call", number: "+91 98765 43210" },
            },
            { resolvePage },
        ) as { href: string };
        expect(out.href).toBe("tel:+919876543210");
    });

    /**
     * The case that motivated filtering hidden pages in the editor.
     *
     * `buildSnapshot` builds its resolver from the pages the publish will
     * WRITE, so a button naming a hidden page resolves to nothing and draws as
     * a label. An editor that resolved over its full page list would show a
     * working link for a page the live site 404s on — a new instance of the old
     * bug, in the one place this whole effort was meant to close.
     */
    it("resolves a button to a page that will not be published as empty", () => {
        const publishable = pagePathResolver(
            [
                { id: "p1", path: "/", hidden: false },
                { id: "p3", path: "/secret", hidden: true },
            ].filter((p) => !p.hidden),
        );
        const out = toRendered(
            "cta",
            { label: "Secret", action: { kind: "page", pageId: "p3" } },
            { resolvePage: publishable },
        ) as { href: string };
        expect(out.href).toBe("");
    });

    it("leaves a block with nothing to resolve untouched", () => {
        const content = { format: "html", value: "<p>hi</p>" };
        expect(toRendered("richText", content, { resolvePage })).toEqual(
            content,
        );
    });

    /**
     * Forward compatibility, matching how the renderer degrades an unknown
     * section type: a draft carrying a type from a newer contract passes
     * through rather than throwing.
     */
    it("passes an unknown block type through unchanged", () => {
        const content = { anything: true };
        expect(toRendered("notAThing", content, { resolvePage })).toBe(content);
    });

    /**
     * A v1 button carries a bare `href` and no `action`. It must survive
     * resolution untouched — publish has always left it alone, and a v1 section
     * that started rendering differently would change pages nobody edited.
     */
    it("leaves a v1 href-only button alone", () => {
        const content = { label: "Go", href: "/somewhere", style: "primary" };
        expect(toRendered("cta", content, { resolvePage })).toEqual(content);
    });
});
