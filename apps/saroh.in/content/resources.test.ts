import { PUBLISHED_ON } from "@saroh/ui/lib/saroh-links";
import { describe, expect, it } from "vitest";

import { resourceItems } from "@/components/v2/nav-items";
import { qrCodeMakerLive } from "@/lib/qr-code-maker-live";
import { indexedPaths } from "@/lib/site-pages";

import { galleryTemplates } from "./templates";

import type { PublishContext } from "./resources";
import {
    LEGAL_PAGES,
    RESOURCE_PAGES,
    dayStartsAt,
    isPublished,
    linkShown,
    resourcePaths,
    routeExists,
    shownLegal,
    shownResources,
    shownTools,
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
    "/tools/qr-code-maker",
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
        // The Terms' and Privacy's date moved to 10 Oct when both were
        // aligned with India's DPDP Act (rev 55): until that day only the
        // Refunds page shows. Privacy's moved again to 13 Oct with the
        // referral code cookie (DEC-156).
        const termsBefore = at("2026-10-08T18:31:00Z");
        const privacyAfter = at("2026-10-12T18:31:00Z");
        expect(shownLegal(legalBefore).map((p) => p.href)).toEqual([]);
        for (const href of ["/privacy", "/terms", "/refunds"]) {
            expect(indexedPaths("waitlist", legalBefore)).not.toContain(href);
            expect(indexedPaths("waitlist", privacyAfter)).toContain(href);
        }
        expect(indexedPaths("waitlist", termsBefore)).not.toContain("/privacy");
        expect(indexedPaths("waitlist", refundsAfter)).not.toContain(
            "/privacy",
        );
        expect(shownLegal(refundsAfter).map((p) => p.href)).toEqual([
            "/refunds",
        ]);
        expect(
            shownLegal(at("2026-10-07T18:29:00Z")).map((p) => p.href),
        ).toEqual(["/refunds"]);
        expect(shownLegal(termsBefore).map((p) => p.href)).toEqual([
            "/refunds",
        ]);
        expect(shownLegal(privacyAfter).map((p) => p.href)).toEqual([
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

    it("Templates switched off is linked and listed nowhere, after its day and on a preview (DEC-135)", () => {
        for (const preview of [false, true]) {
            const off: PublishContext = {
                ...after,
                preview,
                off: ["templates"],
            };
            const ids = shownResources(off).map((p) => p.id);
            expect(ids).not.toContain("templates");
            // Only Templates: the pages beside it stay.
            expect(ids).toEqual(
                shownResources({ ...after, preview })
                    .map((p) => p.id)
                    .filter((id) => id !== "templates"),
            );
            expect(resourcePaths(off)).not.toContain("/templates");
            expect(
                indexedPaths("waitlist", off).filter((p) =>
                    p.startsWith("/templates"),
                ),
            ).toEqual([]);
            // A link into the gallery (the launch entry's "See templates").
            expect(linkShown("/templates", off)).toBe(false);
            expect(linkShown("/templates/gym", off)).toBe(false);
            expect(linkShown("/help", off)).toBe(true);
        }
        expect(linkShown("/templates/gym", after)).toBe(true);
    });

    it("the QR code maker joins the nav, footer and sitemap on 17 Oct, beside the link preview tool", () => {
        const names = (ctx: PublishContext) =>
            resourceItems(shownTools(ctx)).map((i) => i.name);
        expect(names(before)).toEqual(["Link preview tool"]);
        expect(indexedPaths("waitlist", before)).not.toContain(
            "/tools/qr-code-maker",
        );
        expect(qrCodeMakerLive(before)).toBe(false);
        // The tools have their own menu, and Resources never lists them.
        expect(names(after)).toEqual(["Link preview tool", "QR code maker"]);
        expect(
            shownResources(after).filter((p) => p.href.startsWith("/tools/")),
        ).toEqual([]);
        expect(indexedPaths("waitlist", after)).toContain(
            "/tools/qr-code-maker",
        );
        expect(qrCodeMakerLive(after)).toBe(true);
        // A preview shows it early; a build without its route never does.
        expect(qrCodeMakerLive({ ...before, preview: true })).toBe(true);
        const unbuilt = at(
            "2026-10-16T18:31:00Z",
            ALL_ROUTES.filter((r) => r !== "/tools/qr-code-maker"),
        );
        expect(qrCodeMakerLive(unbuilt)).toBe(false);
        expect(names(unbuilt)).not.toContain("QR code maker");
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

// The other apps' footers link Privacy, Terms and Help from the day each
// publishes here, and read those days from `@saroh/ui`. The same check sits
// beside that table, but a change to this site's dates doesn't run the
// package's tests, so a date moved here went out with the other one stale.
describe("the days the other apps' footers go by", () => {
    it.each(["privacy", "terms"] as const)(
        "%s publishes on the day @saroh/ui says",
        (id) => {
            expect(LEGAL_PAGES.find((p) => p.id === id)?.publishOn).toBe(
                PUBLISHED_ON[id],
            );
        },
    );
});
