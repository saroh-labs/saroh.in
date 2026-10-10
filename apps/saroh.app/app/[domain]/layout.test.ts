import type { Metadata } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata } from "./layout";

/**
 * The icon in a merchant page's head (DEC-120): the site's own, else the
 * business logo, else its plain tile, on a live host and a test release's
 * alike. The data layer is mocked; what is under test is what the layout
 * declares from the one public read.
 */
const site = vi.hoisted(() => ({ resolved: null as unknown }));

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
    getMovedTo: vi.fn(),
    shareImages: vi.fn(() => undefined),
}));
vi.mock("@/lib/site-head", () => ({
    NO_HEAD: { verifications: [], trackers: [], privacyUrl: null },
    getSiteHead: vi.fn(() =>
        Promise.resolve({ verifications: [], trackers: [], privacyUrl: null }),
    ),
}));
vi.mock("@/lib/test-release", () => ({
    rootDomain: () => "saroh.app",
    getTestRelease: vi.fn(),
}));

// Everything else the layout draws with; none of it is read for metadata.
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@saroh/site-blocks", () => ({}));
vi.mock("@/components/site-trackers", () => ({ SiteTrackers: () => null }));
vi.mock("@/components/site-view-beacon", () => ({
    SiteViewBeacon: () => null,
}));
vi.mock("@/components/test-release-bar", () => ({
    TestReleaseBar: () => null,
}));
vi.mock("@/components/test-release-gate", () => ({
    TestReleaseGate: () => null,
}));
vi.mock("@/lib/account-area", () => ({ accountAreaOn: () => false }));
vi.mock("@/lib/api-url", () => ({ publicApiUrl: () => "" }));
vi.mock("@/lib/booking-page", () => ({
    getBookingPage: vi.fn(),
    getBookingVisit: vi.fn(),
}));
vi.mock("@/lib/catalogue", () => ({ getCatalogue: vi.fn() }));
vi.mock("@/lib/customer-reader", () => ({ customerReader: vi.fn() }));
vi.mock("@/lib/customer-session", () => ({ getSignedInCustomer: vi.fn() }));
vi.mock("@/lib/header-action", () => ({ headerAction: vi.fn() }));
vi.mock("@/lib/in-page-menu", () => ({ liveMenu: vi.fn() }));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    pageCacheRules: vi.fn(),
}));
vi.mock("@/lib/request-path", () => ({
    movedLocation: vi.fn(),
    REQUEST_PATH_HEADER: "x-saroh-path",
}));
vi.mock("@/lib/shop-checkout", () => ({ getCheckoutOptions: vi.fn() }));
vi.mock("@/lib/sign-in", () => ({ getSignInOptions: vi.fn() }));
vi.mock("@/lib/site-footer", () => ({ getFooterFacts: vi.fn() }));
vi.mock("@/lib/site-relay", () => ({ relayFor: vi.fn() }));
vi.mock("@/lib/test-release-chrome", () => ({ HEADER_BELOW_BAR: "" }));
vi.mock("@/lib/trackers", () => ({ needsConsent: vi.fn() }));
vi.mock("@/lib/site-fonts", () => ({ SITE_FACES: {} }));
vi.mock("./account/actions", () => ({}));
vi.mock("./shop/actions", () => ({}));

const OWN = "https://media.saroh.test/org/o1/site-image/icon.png";
const LOGO = "https://media.saroh.test/org/o1/business-logo/logo.webp";

function resolved(icon: unknown, mode: "live" | "test" = "live") {
    return {
        siteId: "site_1",
        modules: null,
        mode,
        release: null,
        icon,
        snapshot: {
            site: { name: "Northwind Supply", slug: "northwind" },
            pages: [],
        },
    };
}

const metadataFor = (domain = "northwind.saroh.app") =>
    generateMetadata({ params: Promise.resolve({ domain }) });

/** Every icon address a page's metadata names. */
function iconUrls(metadata: Metadata | null): string[] {
    const icons = (metadata?.icons ?? {}) as Record<
        string,
        { url: string }[] | undefined
    >;
    return Object.values(icons).flatMap((list) =>
        (list ?? []).map((i) => i.url),
    );
}

describe("a merchant page's icon", () => {
    beforeEach(() => {
        site.resolved = null;
    });

    it("is the site's own, for the tab and the phone", async () => {
        site.resolved = resolved({
            url: OWN,
            type: "image/png",
            source: "site",
        });
        expect((await metadataFor())?.icons).toEqual({
            icon: [{ url: OWN, type: "image/png" }],
            apple: [{ url: OWN, type: "image/png" }],
        });
    });

    it("is the business logo when the site has none of its own", async () => {
        site.resolved = resolved({
            url: LOGO,
            type: "image/webp",
            source: "business",
        });
        expect((await metadataFor())?.icons).toEqual({
            icon: [{ url: LOGO, type: "image/webp" }],
            apple: [{ url: LOGO, type: "image/webp" }],
        });
    });

    it("is the site's plain tile with neither, on its own address", async () => {
        site.resolved = resolved(null);
        const metadata = await metadataFor("shop.rye.in");
        expect(metadata?.icons).toEqual({
            icon: [
                { url: "/site-icon.svg", type: "image/svg+xml", sizes: "any" },
            ],
        });
        // Resolved against the host the page was asked on.
        expect(metadata?.metadataBase?.toString()).toBe("https://shop.rye.in/");
    });

    it("never names Saroh's own icon files, in any of the three cases", async () => {
        for (const icon of [
            { url: OWN, type: "image/png", source: "site" },
            { url: LOGO, type: "image/webp", source: "business" },
            null,
        ]) {
            site.resolved = resolved(icon);
            const urls = iconUrls(await metadataFor());
            expect(urls.length).toBeGreaterThan(0);
            for (const url of urls) {
                expect(url).not.toMatch(
                    /^\/(favicon\.ico|icon\.svg|apple-icon\.png)$/,
                );
                expect(url).not.toMatch(/saroh\.in/);
            }
        }
    });

    it("stays on a test release's host, which has no share card", async () => {
        site.resolved = resolved(
            { url: OWN, type: "image/png", source: "site" },
            "test",
        );
        const metadata = await metadataFor("test--northwind.saroh.app");
        expect(metadata?.icons).toEqual({
            icon: [{ url: OWN, type: "image/png" }],
            apple: [{ url: OWN, type: "image/png" }],
        });
        expect(metadata?.openGraph).toBeUndefined();
        expect(metadata?.robots).toEqual({ index: false, follow: false });
    });

    it("names none for a host with no live site", async () => {
        expect(await metadataFor("nobody.saroh.app")).toBeNull();
    });
});
