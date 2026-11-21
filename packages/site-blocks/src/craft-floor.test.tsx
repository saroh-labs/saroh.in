// @vitest-environment jsdom
import type { LookId } from "@saroh/block-contract";
import { LOOK_IDS } from "@saroh/block-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageSections } from "./section-renderer";
import { templateRender, templateRenderIndex } from "./showcase/render";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { craftRules } from "./site-craft";

/**
 * The craft floor every template carries (U8, the 17 Nov critique), on
 * every gallery template, every page, Classic and each look, as the
 * server sends it (no script runs):
 *
 * - No text under 12px: no class sets a size below it.
 * - A time slot is "Open", never "Free" (it read as free of charge).
 * - Every section is visible: nothing hidden waiting for a script or a
 *   scroll.
 */

const LOOKS: (LookId | undefined)[] = [undefined, ...LOOK_IDS];

/** A size class under 12px: `text-[11px]`, `text-[11.5px]`, `text-[0.7rem]`. */
function tooSmall(cls: string): boolean {
    const m = /(?:^|:)text-\[(\d*\.?\d+)(px|rem|em)\]$/.exec(cls);
    if (!m) return false;
    const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
    return px < 12;
}

function page(id: string, path: string, look: LookId | undefined) {
    const render = templateRender(id, undefined, path, look);
    if (!render) throw new Error(`No render for ${id} ${path}`);
    const html = renderToStaticMarkup(
        <>
            <SiteHeader
                look={look}
                name={render.name}
                navigation={render.navigation}
                action={render.action}
                shopServes={render.shopServes}
            />
            <PageSections
                sections={render.sections}
                siteName={render.name}
                bookHref="/book"
                journal={render.journal}
                plans={render.plans}
                packs={render.packs}
                productGrids={render.productGrids}
                fixtures={render.fixtures}
                frontDoor={render.frontDoor}
                look={look}
            />
            <SiteFooter look={look} footer={render.footer} name={render.name} />
        </>,
    );
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
}

const CASES = templateRenderIndex().flatMap((t) =>
    t.pages.flatMap((p) =>
        LOOKS.map((look) => [t.id, p.path, look ?? "classic"] as const),
    ),
);

describe("the craft floor, on every template", () => {
    it("reads a size under 12px with or without a variant", () => {
        expect(tooSmall("text-[11.5px]")).toBe(true);
        expect(tooSmall("max-[699px]:text-[11px]")).toBe(true);
        expect(tooSmall("text-[0.7rem]")).toBe(true);
        expect(tooSmall("text-[12px]")).toBe(false);
        expect(tooSmall("text-[13.5px]")).toBe(false);
    });

    it("covers every gallery template", () => {
        expect(new Set(CASES.map(([id]) => id)).size).toBeGreaterThan(5);
    });

    it.each(CASES)("%s %s (%s)", (id, path, lookName) => {
        const look = lookName === "classic" ? undefined : lookName;
        const root = page(id, path, look);

        const small = Array.from(root.querySelectorAll("[class]")).flatMap(
            (el) =>
                (el.getAttribute("class") ?? "")
                    .split(/\s+/)
                    .filter(tooSmall)
                    .map((cls) => `${cls}: ${el.textContent.slice(0, 30)}`),
        );
        expect(small).toEqual([]);

        // A slot's state is a word on its own: "Open", "2 left", "Full".
        const free = Array.from(root.querySelectorAll("span, li, p")).filter(
            (el) => /^Free( today)?$/.test(el.textContent.trim()),
        );
        expect(free.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);

        // Every section is there with no script: nothing at opacity 0 or
        // hidden by an inline style.
        for (const section of Array.from(
            root.querySelectorAll("[data-site-section]"),
        )) {
            expect(
                `${section.textContent.trim()}${section.querySelector("img, svg, picture") ? "[picture]" : ""}`,
                section.outerHTML.slice(0, 300),
            ).not.toBe("");
            for (const el of [
                section,
                ...Array.from(section.querySelectorAll("*")),
            ]) {
                const cls = el.getAttribute("class") ?? "";
                const style = el.getAttribute("style") ?? "";
                // An input's own overlay (the phone field's country) is a
                // control, not content.
                if (el.tagName === "SELECT") continue;
                expect(cls.split(/\s+/)).not.toContain("opacity-0");
                expect(style).not.toMatch(
                    /opacity:\s*0(?![.\d])|visibility:\s*hidden/,
                );
            }
        }
    });

    it.each(LOOKS.map((l) => l ?? "classic"))(
        "%s: the theme hides no section waiting for a scroll",
        (lookName) => {
            const look = lookName === "classic" ? undefined : lookName;
            const sheet = craftRules(":root", undefined, look);
            expect(sheet).not.toMatch(/animation-timeline|view\(\)/);
            expect(sheet).not.toMatch(
                /\[data-site-section\][^{]*\{[^}]*\b(?:opacity|animation)\s*:/,
            );
        },
    );
});
