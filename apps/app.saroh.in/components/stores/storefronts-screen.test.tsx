import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SiteSelling } from "@/lib/sites/sells-from";
import type {
    StorefrontSettings,
    StorefrontSummary,
} from "@/lib/stores/storefronts";

import { StorefrontsScreen } from "./storefronts-screen";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    closeStorefront: vi.fn(),
    updateStorefront: vi.fn(),
}));

/**
 * Sell → Locations (DEC-069, L9): the screen says location, the two kinds
 * read "Customers visit" and "No counter" (KTD-12), and the chosen location
 * says where it sells. Identifiers stay storefront; the words don't.
 */

const hill: StorefrontSettings = {
    id: "st_hill",
    name: "Hill Road",
    orderCount: 3,
    kind: "SHOP",
    paused: false,
    currency: "INR",
    currencyLocked: true,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: false,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: "12 Hill Road",
    openingHours: null,
    collectionEnabled: true,
    fulfilmentTypes: ["PICKUP"],
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    linkSameEmailCustomers: false,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
};
const summary = (s: StorefrontSettings): StorefrontSummary => ({
    id: s.id,
    name: s.name,
    orderCount: s.orderCount,
    kind: s.kind,
    paused: s.paused,
});
const online: StorefrontSettings = {
    ...hill,
    id: "st_online",
    name: "Online",
    kind: "ONLINE",
    address: null,
};

const site = (sellsFromId: string): SiteSelling => ({
    siteId: "site_1",
    origin: "https://rye.saroh.app",
    sellsFrom: {
        storefront: { id: sellsFromId, name: "It" },
        choices: [{ id: sellsFromId, name: "It", products: 2 }],
    },
});

const screen = (props: Partial<Parameters<typeof StorefrontsScreen>[0]> = {}) =>
    renderToStaticMarkup(
        <StorefrontsScreen
            businessName="Rye & Co."
            storefronts={[summary(hill)]}
            selected={hill}
            canCreate
            canEdit
            canClose
            {...props}
        />,
    );

/** What a person reads: the text, not the ids and classes. */
const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");

describe("StorefrontsScreen as Locations (DEC-069, L9)", () => {
    it("one location: titled Location, with New location and the kind choice", () => {
        const t = text(screen());
        expect(t).toContain("Location");
        expect(t).toContain("New location");
        expect(t).toContain("Location name");
        expect(t).toContain("Do customers come here?");
        expect(t).toContain("Customers visit");
        expect(t).toContain("No counter");
        expect(t).toContain("Location address");
        expect(t).toContain("stays the same at every location");
        // One location, no list (the singular rule, `pick.ts`).
        expect(t).not.toContain("1 location");
    });

    it("says no merchant-visible storefront, in any state", () => {
        for (const html of [
            screen(),
            screen({ site: site("st_hill") }),
            screen({ site: null }),
            screen({
                storefronts: [summary(hill), summary(online)],
                selected: online,
                site: site("st_online"),
            }),
            screen({ storefronts: [], selected: null }),
            screen({ selected: null }),
        ]) {
            expect(text(html)).not.toMatch(/storefront/i);
            expect(text(html)).not.toMatch(/online store/i);
        }
    });

    it("the Sells from location sells in person and online", () => {
        const html = screen({ site: site("st_hill") });
        expect(text(html)).toContain("Sells in person and online");
        expect(html).toContain('href="https://rye.saroh.app/shop"');
    });

    it("a location the shop doesn't sell from sells in person only", () => {
        expect(text(screen({ site: site("st_online") }))).toContain(
            "Sells in person only",
        );
    });

    it("a No counter Sells from sells online only", () => {
        const t = text(
            screen({
                storefronts: [summary(hill), summary(online)],
                selected: online,
                site: site("st_online"),
            }),
        );
        expect(t).toContain("Online only");
        // Several: the list, counted and badged by kind.
        expect(t).toContain("Locations");
        expect(t).toContain("2 locations");
    });

    it("says nothing about selling when the site couldn't be read", () => {
        const html = screen({ site: undefined });
        expect(html).not.toContain('data-testid="location-selling"');
    });

    it("links to Description and logo, with no Web address (L14)", () => {
        const t = text(screen());
        expect(t).toContain("Description and logo");
        expect(t).not.toContain("Web address");
    });

    it("no location yet: says so, and offers Add a location", () => {
        const t = text(screen({ storefronts: [], selected: null }));
        expect(t).toContain("No location yet");
        expect(t).toContain("Add a location");
    });
});
