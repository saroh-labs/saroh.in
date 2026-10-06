import { describe, expect, it } from "vitest";

import { summarise } from "@/content/help";
import type { PublishContext } from "@/content/resources";

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

    it("gives every link a one-line description", () => {
        const text = llmsText(BASE, at(AFTER), articles);
        const links = text.split("\n").filter((l) => l.startsWith("- ["));
        expect(links.length).toBeGreaterThan(10);
        for (const l of links) expect(l).toMatch(/^- \[[^\]]+\]\([^)]+\): \S/);
    });
});
