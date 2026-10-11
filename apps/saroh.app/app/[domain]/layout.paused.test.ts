import { beforeEach, describe, expect, it, vi } from "vitest";

import SiteLayout from "./layout";

/**
 * A request on a domain its plan has paused (DEC-139): a temporary redirect
 * to the same path on the business's Saroh address, before anything of the
 * site is read. The data layer is mocked; what is under test is where the
 * layout sends the visitor. Every host is made up.
 */
const state = vi.hoisted(
    (): {
        resolved: unknown;
        pausedTo: string | null;
        movedTo: string | null;
        path: string | null;
        release: unknown;
    } => ({
        resolved: null,
        pausedTo: null,
        movedTo: null,
        path: null,
        release: null,
    }),
);
const nav = vi.hoisted(() => ({
    redirect: vi.fn((to: string) => {
        throw new Error(`REDIRECT ${to}`);
    }),
    notFound: vi.fn(() => {
        throw new Error("NOT_FOUND");
    }),
}));
const reads = vi.hoisted(() => ({
    getDomainPausedTo: vi.fn((_host: string) =>
        Promise.resolve(state.pausedTo),
    ),
    getMovedTo: vi.fn(() => Promise.resolve(state.movedTo)),
    getBookingPage: vi.fn(),
}));

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(state.resolved)),
    getDomainPausedTo: reads.getDomainPausedTo,
    getMovedTo: reads.getMovedTo,
    shareImages: vi.fn(() => undefined),
    siteOriginFor: (_site: unknown, host: string) => `https://${host}`,
}));
vi.mock("@/lib/test-release", () => ({
    rootDomain: () => "saroh.app",
    getTestRelease: vi.fn(() => Promise.resolve(state.release)),
}));
vi.mock("next/headers", () => ({
    headers: vi.fn(() =>
        Promise.resolve(
            new Headers(
                state.path === null
                    ? {}
                    : { "x-saroh-request-path": state.path },
            ),
        ),
    ),
}));
vi.mock("next/navigation", () => nav);

// Everything else the layout draws with; none of it is reached on a miss.
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
    getBookingPage: reads.getBookingPage,
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
vi.mock("@/lib/shop-checkout", () => ({ getCheckoutOptions: vi.fn() }));
vi.mock("@/lib/sign-in", () => ({ getSignInOptions: vi.fn() }));
vi.mock("@/lib/site-contact", () => ({ getSiteContact: vi.fn() }));
vi.mock("@/lib/site-footer", () => ({ getFooterFacts: vi.fn() }));
vi.mock("@/lib/site-head", () => ({
    NO_HEAD: { verifications: [], trackers: [], privacyUrl: null },
    getSiteHead: vi.fn(),
}));
vi.mock("@/lib/site-relay", () => ({ relayFor: vi.fn() }));
vi.mock("@/lib/test-release-chrome", () => ({ HEADER_BELOW_BAR: "" }));
vi.mock("@/lib/trackers", () => ({ needsConsent: vi.fn() }));
vi.mock("@/lib/site-fonts", () => ({ SITE_FACES: {} }));
vi.mock("./account/actions", () => ({}));
vi.mock("./shop/actions", () => ({}));

const draw = (domain: string) =>
    SiteLayout({ params: Promise.resolve({ domain }), children: null });

beforeEach(() => {
    vi.clearAllMocks();
    state.resolved = null;
    state.pausedTo = null;
    state.movedTo = null;
    state.path = null;
    state.release = null;
});

describe("a request on a paused domain (DEC-139)", () => {
    it("goes to the same path and query on the Saroh address", async () => {
        state.pausedTo = "https://yourshop.saroh.app";
        state.path = "/shop/blue-mug?size=l";
        await expect(draw("shop.example.com")).rejects.toThrow(
            "REDIRECT https://yourshop.saroh.app/shop/blue-mug?size=l",
        );
        expect(reads.getDomainPausedTo).toHaveBeenCalledWith(
            "shop.example.com",
        );
        // `redirect()`, which answers 307: never the permanent one.
        expect(nav.redirect).toHaveBeenCalledTimes(1);
        // Nothing of the site was read, and nothing was drawn.
        expect(reads.getBookingPage).not.toHaveBeenCalled();
        expect(nav.notFound).not.toHaveBeenCalled();
    });

    it("lands on the root when no path was named", async () => {
        state.pausedTo = "https://yourshop.saroh.app";
        await expect(draw("shop.example.com")).rejects.toThrow(
            "REDIRECT https://yourshop.saroh.app/",
        );
    });

    it("keeps the visitor on the Saroh address, whatever path was sent", async () => {
        state.pausedTo = "https://yourshop.saroh.app";
        for (const path of ["//evil.example.com", "/\\evil.example.com"]) {
            state.path = path;
            await expect(draw("shop.example.com")).rejects.toThrow(
                "REDIRECT https://yourshop.saroh.app/",
            );
        }
    });

    it("sends its test host on too, to the root of the Saroh test host", async () => {
        state.release = { ok: false, reason: "missing", liveUrl: null };
        state.pausedTo = "https://test--yourshop.saroh.app";
        // A test host's rewrite names no path: one a visitor sent is ignored.
        state.path = "/anything";
        await expect(draw("test.shop.example.com")).rejects.toThrow(
            "REDIRECT https://test--yourshop.saroh.app/",
        );
    });

    it("is a plain 404 for a host that is neither paused nor moved", async () => {
        await expect(draw("shop.example.com")).rejects.toThrow("NOT_FOUND");
        expect(nav.redirect).not.toHaveBeenCalled();
    });

    it("still forwards an old Saroh address, which is never paused", async () => {
        state.movedTo = "https://yourshop.saroh.app";
        state.path = "/about";
        await expect(draw("oldshop.saroh.app")).rejects.toThrow(
            "REDIRECT https://yourshop.saroh.app/about",
        );
    });
});
