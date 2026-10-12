import { describe, expect, it } from "vitest";

import { summarise } from "@/content/help";
import type { PublishContext } from "@/content/resources";
import { galleryTemplates } from "@/content/templates";

import { helpArticles } from "./help-docs";
import { llmsText } from "./llms";

/**
 * `/llms.txt` follows the Resources publish rule (plan U7, KTD-2): before
 * 17 Oct no Help, its articles or the launch entry; from midnight in India
 * on the day, all of them; a preview shows them early; a page whose route
 * isn't built is never listed.
 */

const BASE = "https://www.saroh.in";

const ALL_ROUTES = [
    "/changelog",
    "/changelog/[slug]",
    "/help",
    "/help/[slug]",
    "/integrations",
    "/integrations/[provider]",
    "/privacy",
    "/refunds",
    "/terms",
    "/tools/link-preview",
];

const at = (
    iso: string,
    over: Partial<PublishContext> = {},
): PublishContext => ({
    now: new Date(iso),
    preview: false,
    routes: ALL_ROUTES,
    ...over,
});

const articles = helpArticles().map((fm) => ({
    ...summarise(fm),
    description: fm.description,
}));

/** The site paths the file links, in order. */
const linked = (text: string) =>
    Array.from(text.matchAll(/\]\((https:\/\/[^)]+)\)/g)).map(
        (m) => new URL(m[1]).pathname,
    );

const BEFORE = "2026-10-16T18:29:59.999Z"; // 16 Oct, 23:59:59.999 in India
const AFTER = "2026-10-16T18:30:00.000Z"; // 17 Oct, midnight in India

describe("llmsText", () => {
    it("opens with the site's name and what Saroh is", () => {
        const text = llmsText(BASE, at(BEFORE), articles);
        expect(text.startsWith("# Saroh\n\n> Saroh is ")).toBe(true);
        expect(text.endsWith("\n")).toBe(true);
    });

    it("before Help publishes, lists the live pages only", () => {
        const paths = linked(llmsText(BASE, at(BEFORE), articles));
        expect(paths).toEqual([
            "/integrations",
            "/changelog",
            "/tools/link-preview",
            "/integrations/razorpay",
            "/integrations/cashfree",
            "/integrations/email",
            "/privacy",
            "/terms",
            "/refunds",
        ]);
        expect(paths.some((p) => p.startsWith("/help"))).toBe(false);
        expect(paths).not.toContain("/changelog/saroh-is-open");
    });

    it("from midnight in India on 17 Oct, adds Help, every article and the launch entry", () => {
        const text = llmsText(BASE, at(AFTER), articles);
        const paths = linked(text);
        expect(paths[0]).toBe("/help");
        for (const a of articles) {
            expect(paths).toContain(`/help/${a.slug}`);
            expect(text).toContain(
                `- [${a.title}](${BASE}/help/${a.slug}): ${a.description}`,
            );
        }
        expect(paths).toContain("/changelog/saroh-is-open");
        expect(text).toContain("## Help articles");
    });

    it("a preview shows the unpublished pages early", () => {
        const paths = linked(
            llmsText(BASE, at(BEFORE, { preview: true }), articles),
        );
        expect(paths).toContain("/help");
        expect(paths).toContain("/help/add-your-first-product");
        expect(paths).toContain("/changelog/saroh-is-open");
    });

    it("never lists a page whose route this build lacks", () => {
        const routes = ALL_ROUTES.filter(
            (r) => r !== "/help/[slug]" && r !== "/tools/link-preview",
        );
        const paths = linked(llmsText(BASE, at(AFTER, { routes }), articles));
        expect(paths).toContain("/help");
        expect(paths.some((p) => p.startsWith("/help/"))).toBe(false);
        expect(paths).not.toContain("/tools/link-preview");
    });

    it("lists the Templates gallery and each template from 17 Oct, once built", () => {
        const routes = [...ALL_ROUTES, "/templates", "/templates/[slug]"];
        const before = linked(llmsText(BASE, at(BEFORE, { routes }), articles));
        expect(before.some((p) => p.startsWith("/templates"))).toBe(false);
        const text = llmsText(BASE, at(AFTER, { routes }), articles);
        const paths = linked(text);
        expect(paths).toContain("/templates");
        expect(text).toContain("## Templates");
        for (const t of galleryTemplates()) {
            expect(text).toContain(
                `- [${t.name}](${BASE}/templates/${t.slug}): ${t.description}`,
            );
        }
        // Not built in this build: neither the page nor its templates.
        expect(
            linked(llmsText(BASE, at(AFTER), articles)).some((p) =>
                p.startsWith("/templates"),
            ),
        ).toBe(false);
    });

    it("lists no template, whatever the date or preview, while Templates is switched off (DEC-135)", () => {
        const routes = [...ALL_ROUTES, "/templates", "/templates/[slug]"];
        for (const preview of [false, true]) {
            const text = llmsText(
                BASE,
                at(AFTER, { routes, preview, off: ["templates"] }),
                articles,
            );
            expect(text).not.toContain("Templates");
            expect(linked(text).some((p) => p.startsWith("/templates"))).toBe(
                false,
            );
            // The other Resources pages are untouched.
            expect(linked(text)).toContain("/help");
        }
    });

    it("lists About and Contact first, whatever the date, once their routes are built (DEC-137)", () => {
        const routes = [...ALL_ROUTES, "/about", "/contact"];
        for (const when of [BEFORE, AFTER]) {
            const text = llmsText(BASE, at(when, { routes }), articles);
            expect(linked(text).slice(0, 2)).toEqual(["/about", "/contact"]);
            expect(text).toContain(
                "## Saroh\n\n- [About](https://www.saroh.in/about): ",
            );
        }
        // A build without the routes never links them.
        const without = linked(llmsText(BASE, at(AFTER), articles));
        expect(without).not.toContain("/about");
        expect(without).not.toContain("/contact");
    });

    it("gives every link a one-line description", () => {
        const text = llmsText(BASE, at(AFTER), articles);
        const links = text.split("\n").filter((l) => l.startsWith("- ["));
        expect(links.length).toBeGreaterThan(10);
        for (const l of links) expect(l).toMatch(/^- \[[^\]]+\]\([^)]+\): \S/);
    });

    it("lists every feature and solution page once its route is built, Website and Salons among them", () => {
        const routes = [...ALL_ROUTES, "/features/[slug]", "/solutions/[slug]"];
        for (const when of [BEFORE, AFTER]) {
            const text = llmsText(BASE, at(when, { routes }), articles);
            const paths = linked(text);
            expect(
                paths.filter((p) => p.startsWith("/features/")),
            ).toHaveLength(9);
            expect(
                paths.filter((p) => p.startsWith("/solutions/")),
            ).toHaveLength(4);
            expect(text).toContain(
                "- [Website](https://www.saroh.in/features/website): A website builder for small businesses in India",
            );
            expect(text).toContain(
                "- [Salons and parlours](https://www.saroh.in/solutions/salons): Salon booking software",
            );
            // Nothing about a plan, a price or a template (DEC-135, DEC-136).
            const section = text.slice(
                text.indexOf("## Features"),
                text.indexOf("## Resources"),
            );
            expect(section).not.toMatch(/template|pricing|\bplans?\b|\u20B9/i);
        }
        // A build without the routes never links them.
        const without = linked(llmsText(BASE, at(AFTER), articles));
        expect(without.some((p) => p.startsWith("/features/"))).toBe(false);
        expect(without.some((p) => p.startsWith("/solutions/"))).toBe(false);
    });
});
