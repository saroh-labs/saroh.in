import { describe, expect, it } from "vitest";

import { resourceItems } from "@/components/v2/nav-items";
import { indexedPaths } from "@/lib/site-pages";

import { galleryTemplates } from "./templates";

import type { PublishContext } from "./resources";
import {
    RESOURCE_PAGES,
    dayStartsAt,
    isPublished,
    linkShown,
    resourcePaths,
    routeExists,
    shownLegal,
    shownResources,
} from "./resources";

/**
 * Publish by date (plan U1, KTD-2): one rule, midnight in India, for every
 * Resources page; a page shows only when published AND built.
 */

/** Every Resources route built, as after the batch merges. */
const ALL_ROUTES = [
    "/",
    "/changelog",
    "/changelog/[slug]",
    "/features/[slug]",
    "/help",
    "/help/[slug]",
    "/integrations",
    "/integrations/[provider]",
    "/privacy",
    "/refunds",
    "/solutions/[slug]",
    "/templates",
    "/templates/[slug]",
    "/terms",
    "/tools/link-preview",
    "/waitlist",
];

const at = (
    iso: string,
    routes: string[] | null = ALL_ROUTES,
): PublishContext => ({
    now: new Date(iso),
    preview: false,
    routes,
});

describe("isPublished: the day begins at midnight in India", () => {
    it("is not live one millisecond before midnight IST", () => {
        // 16 Oct 18:29:59.999 UTC is 16 Oct 23:59:59.999 in India.
        expect(
            isPublished("2026-10-17", new Date("2026-10-16T18:29:59.999Z")),
        ).toBe(false);
    });

    it("is live at midnight IST, which is still the 16th in UTC", () => {
        expect(
            isPublished("2026-10-17", new Date("2026-10-16T18:30:00.000Z")),
        ).toBe(true);
        expect(dayStartsAt("2026-10-17").toISOString()).toBe(
            "2026-10-16T18:30:00.000Z",
        );
    });

    it("stays live afterwards", () => {
        expect(
            isPublished("2026-10-17", new Date("2027-01-01T00:00:00Z")),
        ).toBe(true);
    });

    it("refuses a date it can't read rather than guessing", () => {
        expect(() => isPublished("17 Oct", new Date())).toThrow();
    });
});

describe("an unpublished page is in neither the nav nor the sitemap", () => {
    const before = at("2026-10-16T18:29:00Z");
    const after = at("2026-10-16T18:31:00Z");

    it("Help is out of the nav, footer and sitemap until 17 Oct in India", () => {
        const names = (ctx: PublishContext) =>
            resourceItems(shownResources(ctx)).map((i) => i.name);
        expect(names(before)).not.toContain("Help");
        expect(indexedPaths("waitlist", before)).not.toContain("/help");
        expect(names(after)).toContain("Help");
        expect(indexedPaths("waitlist", after)).toContain("/help");
    });

    it("the legal pages are out of the footer and sitemap until their day in India", () => {
        const legalBefore = at("2026-10-04T18:29:00Z");
        const refundsAfter = at("2026-10-04T18:31:00Z");
        // Privacy's and the Terms' dates moved to 8 Oct with merchants' own
        // trackers (DEC-108): until that day only the Refunds page shows.
        const termsAfter = at("2026-10-07T18:31:00Z");
        expect(shownLegal(legalBefore).map((p) => p.href)).toEqual([]);
        for (const href of ["/privacy", "/terms", "/refunds"]) {
            expect(indexedPaths("waitlist", legalBefore)).not.toContain(href);
            expect(indexedPaths("waitlist", termsAfter)).toContain(href);
        }
        expect(indexedPaths("waitlist", refundsAfter)).not.toContain(
            "/privacy",
        );
        expect(shownLegal(refundsAfter).map((p) => p.href)).toEqual([
            "/refunds",
        ]);
        expect(
            shownLegal(at("2026-10-07T18:29:00Z")).map((p) => p.href),
        ).toEqual(["/refunds"]);
        expect(shownLegal(termsAfter).map((p) => p.href)).toEqual([
            "/privacy",
            "/terms",
            "/refunds",
        ]);
    });

    it("Templates and every gallery template join the nav and sitemap on 17 Oct", () => {
        const names = (ctx: PublishContext) =>
            resourceItems(shownResources(ctx)).map((i) => i.name);
        expect(names(before)).not.toContain("Templates");
        expect(
            indexedPaths("waitlist", before).filter((p) =>
                p.startsWith("/templates"),
            ),
        ).toEqual([]);
        expect(names(after)).toContain("Templates");
        const paths = indexedPaths("waitlist", after);
        expect(paths).toContain("/templates");
        for (const t of galleryTemplates()) {
            expect(paths).toContain(`/templates/${t.slug}`);
        }
        // The detail pages need their own route.
        const noDetail = at(
            "2026-10-16T18:31:00Z",
            ALL_ROUTES.filter((r) => r !== "/templates/[slug]"),
        );
        expect(indexedPaths("waitlist", noDetail)).toContain("/templates");
        expect(
            indexedPaths("waitlist", noDetail).some((p) =>
                p.startsWith("/templates/"),
            ),
        ).toBe(false);
    });

    it("the launch entry joins the sitemap on its day", () => {
        expect(indexedPaths("waitlist", before)).toContain("/changelog");
        expect(indexedPaths("waitlist", before)).not.toContain(
            "/changelog/saroh-is-open",
        );
        expect(indexedPaths("waitlist", after)).toContain(
            "/changelog/saroh-is-open",
        );
    });

    it("a preview shows unpublished pages", () => {
        const preview = { ...before, preview: true };
        expect(shownResources(preview).map((p) => p.id)).toContain("help");
        expect(indexedPaths("waitlist", preview)).toContain("/privacy");
    });
});

describe("a page shows only once its route is built", () => {
    // This branch alone: no Integrations or link preview routes yet.
    const ownRoutes = ALL_ROUTES.filter(
        (r) => !r.startsWith("/integrations") && !r.startsWith("/tools"),
    );
    const ctx = at("2026-10-20T00:00:00Z", ownRoutes);

    it("a listed page without its route is linked nowhere", () => {
        const ids = shownResources(ctx).map((p) => p.id);
        expect(ids).toEqual(["help", "changelog", "templates"]);
        expect(resourcePaths(ctx)).not.toContain("/integrations");
        expect(resourcePaths(ctx)).not.toContain("/integrations/razorpay");
    });

    it("an entry's link into an unbuilt page is not drawn; any other is", () => {
        expect(linkShown("/integrations/razorpay", ctx)).toBe(false);
        expect(linkShown("/features/orders", ctx)).toBe(true);
        expect(
            linkShown("/integrations/razorpay", at("2026-10-20T00:00:00Z")),
        ).toBe(true);
    });

    it("dynamic routes answer their children", () => {
        expect(
            routeExists("/integrations/email", ["/integrations/[provider]"]),
        ).toBe(true);
        expect(routeExists("/integrations", ["/integrations/[provider]"])).toBe(
            false,
        );
        expect(routeExists("/anything", null)).toBe(true);
    });
});

describe("the list", () => {
    it("lists Templates with early access, 17 Oct (plan U6, industry templates U13)", () => {
        const templates = RESOURCE_PAGES.find((p) => p.href === "/templates");
        expect(templates?.publishOn).toBe("2026-10-17");
    });

    it("has one entry per address, each with a name and a line", () => {
        const hrefs = RESOURCE_PAGES.map((p) => p.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        for (const p of RESOURCE_PAGES) {
            expect(p.name.trim()).not.toBe("");
            expect(p.line.trim()).not.toBe("");
            expect(() => dayStartsAt(p.publishOn)).not.toThrow();
        }
    });
});
