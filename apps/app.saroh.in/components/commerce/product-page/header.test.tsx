import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/qr/link-qr/qr-button", () => ({ QrButton: () => null }));
vi.mock("./product-actions", () => ({ ProductActions: () => null }));

import type { ProductOverview } from "@/lib/products/overview-rules";
import type { ShareSetup } from "@/lib/share-item/share";

import type { ProductShare } from "./header";
import { ProductHeader } from "./header";

/**
 * Share as a post (#1375 U2): the Share button sits by the QR code only
 * while the product's page is live, and never without the live site read.
 */

const overview = {
    product: {
        id: "p1",
        name: "Cardamom bun box",
        slug: "cardamom-bun-box",
        status: "PUBLISHED",
        currency: "INR",
        images: [],
        storefronts: [],
        category: null,
    },
    price: { min: "360", max: "360" },
    storefront: { id: "s1", name: "Hill Road" },
    lastChanged: "2026-11-10T09:00:00.000Z",
    canWrite: false,
} as unknown as ProductOverview;

const SETUP: ShareSetup = {
    apiOrigin: "https://api.example.com",
    siteId: "site_1",
    schedule: { tier: "free" },
};
const SHARE: ProductShare = {
    setup: SETUP,
    item: {
        kind: "product",
        ref: "cardamom-bun-box",
        name: "Cardamom bun box",
        price: "₹360",
        url: "https://rye.example.com/shop/cardamom-bun-box",
        offerId: null,
    },
};

const draw = (shopUrl: string | null, share: ProductShare | null) =>
    renderToStaticMarkup(
        <ProductHeader
            overview={overview}
            storeId="s1"
            photosHref="/p"
            view="team"
            shopUrl={shopUrl}
            share={share}
        />,
    );

describe("the product header's Share", () => {
    it("is there for a live page, at the desk and on a phone", () => {
        const html = draw(SHARE.item.url, SHARE);
        expect(html.match(/data-share-item="product"/g)).toHaveLength(2);
    });

    it("is left out while the page isn't live, or the site couldn't be read", () => {
        expect(draw(null, SHARE)).not.toContain("data-share-item");
        expect(draw(SHARE.item.url, null)).not.toContain("data-share-item");
    });
});
