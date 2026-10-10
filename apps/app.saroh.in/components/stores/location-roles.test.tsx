import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LocationAbilities } from "@/lib/stores/abilities";
import type { LocationDetails } from "@/lib/stores/location-details";
import type { StorefrontSettings } from "@/lib/stores/storefronts";

import { LocationDetailsSheet } from "./location-details-sheet";
import { aboutOnlyNote, StorefrontsScreen } from "./storefronts-screen";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    closeStorefront: vi.fn(),
    updateStorefront: vi.fn(),
}));
vi.mock("@/lib/stores/actions", () => ({ updateStore: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
}));
vi.mock("@/components/shared/logo-upload", () => ({
    LogoUpload: () => <button type="button">Upload a logo</button>,
}));
// The sheet in place, so its body can be read without a browser.
vi.mock("@saroh/ui/sheet", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).sheetMock(),
);

/**
 * A location's page for the people invited to it (UX audit, 10 Oct 2026).
 * What each is offered comes from the location's own read, never the
 * role's name: an Admin, Manager or Editor edits its name and its
 * description; a Viewer edits nothing; nobody without the team's
 * permission is offered the business's settings. Made-up names only.
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
    address: "12 Hill Road\nBandra",
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

const may = (edit: boolean): LocationAbilities => ({
    edit,
    takeOrders: edit,
    takePayments: false,
    changeOrders: edit,
});

const details = (abilities?: LocationAbilities): LocationDetails => ({
    description: "Sourdough, baked daily.",
    logo: null,
    businessLogo: null,
    ...(abilities ? { may: abilities } : {}),
});

const screen = (about: LocationDetails | undefined, canUploadLogo = false) =>
    renderToStaticMarkup(
        <StorefrontsScreen
            businessName="Rye & Co."
            storefronts={[
                {
                    id: hill.id,
                    name: hill.name,
                    orderCount: hill.orderCount,
                    kind: hill.kind,
                    paused: hill.paused,
                },
            ]}
            selected={hill}
            details={about}
            canCreate={false}
            canEdit={false}
            canClose={false}
            canUploadLogo={canUploadLogo}
        />,
    )
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

/** The rows' Edit buttons, by what each says it edits. */
function edits(html: string): string[] {
    const found: string[] = [];
    const button = /<button[^>]*aria-label="(Edit[^"]*)"/g;
    for (let m = button.exec(html); m; m = button.exec(html)) found.push(m[1]);
    return found;
}

describe("a location's page, for someone invited to it", () => {
    it("offers a location Editor its name and its description, and nothing else", () => {
        const html = screen(details(may(true)));
        expect(edits(html)).toEqual(["Edit name", "Edit description and logo"]);
    });

    it("says what they can change, in place of the plain read-only note", () => {
        const html = screen(details(may(true)));
        expect(html).toContain(aboutOnlyNote(false));
        expect(html).not.toContain(
            "Your role can read these settings but not change them.",
        );
    });

    it("offers a location Viewer nothing to edit, and the read-only note", () => {
        const html = screen(details(may(false)));
        expect(edits(html)).toEqual([]);
        expect(html).toContain(
            "Your role can read these settings but not change them.",
        );
    });

    it("offers nothing when the location's read said nothing, or couldn't be made", () => {
        expect(edits(screen(details()))).toEqual([]);
        expect(edits(screen(undefined))).toEqual([]);
    });

    it("names the logo only for a role that can add images", () => {
        expect(aboutOnlyNote(true)).toBe(
            "You can change this location's name, description and logo. Your role can read the rest but not change it.",
        );
        expect(aboutOnlyNote(false)).toBe(
            "You can change this location's name and description. Your role can read the rest but not change it.",
        );
    });
});

describe("Description and logo, for someone whose role can't add images", () => {
    const sheet = (canUploadLogo: boolean) =>
        renderToStaticMarkup(
            <LocationDetailsSheet
                storeId="st_hill"
                name="Hill Road"
                details={details()}
                canUploadLogo={canUploadLogo}
                open
                onClose={() => undefined}
                onSaved={() => undefined}
            />,
        ).replace(/&#x27;/g, "'");

    it("says the logo stays, and offers no upload that would be refused", () => {
        const html = sheet(false);
        expect(html).toContain(
            "Your role can't add images, so the logo stays as it is. An owner or admin can change it.",
        );
        expect(html).not.toContain("Upload a logo");
    });

    it("offers the upload to a role that can", () => {
        const html = sheet(true);
        expect(html).toContain("Upload a logo");
        expect(html).not.toContain("Your role can't add images");
    });
});
