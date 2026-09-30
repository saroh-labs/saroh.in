import { describe, expect, it } from "vitest";

import {
    BOOKINGS_FIRST_RUN,
    ORDERS_FIRST_RUN,
    shareLink,
    siteAddressOf,
} from "./share-links";

/** The API's web-address read, as L2 answers it. */
function read(
    links: Partial<{ site: string; shop: string; book: string }>,
    over: Partial<{
        address: string;
        origin: string;
        customDomain: string;
    }> = {},
) {
    const address = over.address ?? "rye";
    return {
        address,
        origin: over.origin ?? `https://${address}.saroh.app`,
        platformOrigin: `https://${address}.saroh.app`,
        customDomain: over.customDomain ?? null,
        links: {
            site: links.site ?? null,
            shop: links.shop ?? null,
            book: links.book ?? null,
        },
    };
}

describe("shareLink — the link that fits (DEC-069, L8)", () => {
    it("shares the online shop while it is live", () => {
        expect(
            shareLink(
                read({
                    site: "https://rye.saroh.app",
                    shop: "https://rye.saroh.app/shop",
                }),
                ORDERS_FIRST_RUN,
            ),
        ).toEqual({
            kind: "shop",
            url: "https://rye.saroh.app/shop",
            label: "Share your online shop",
            copied: "Online shop link copied",
        });
    });

    it("shares the website when the site is live but the shop isn't", () => {
        const link = shareLink(
            read({ site: "https://rye.saroh.app" }),
            ORDERS_FIRST_RUN,
        );
        expect(link?.url).toBe("https://rye.saroh.app");
        expect(link?.label).toBe("Share your website");
    });

    it("offers nothing when nothing is live, or the read is unknown", () => {
        expect(shareLink(read({}), ORDERS_FIRST_RUN)).toBeNull();
        expect(shareLink(null, ORDERS_FIRST_RUN)).toBeNull();
        // The website being live is no booking page.
        expect(
            shareLink(
                read({ site: "https://rye.saroh.app" }),
                BOOKINGS_FIRST_RUN,
            ),
        ).toBeNull();
    });

    it("shares the booking page on its own origin", () => {
        const link = shareLink(
            read({
                site: "https://shop.rye.in",
                book: "https://shop.rye.in/book",
            }),
            BOOKINGS_FIRST_RUN,
        );
        expect(link?.url).toBe("https://shop.rye.in/book");
        expect(link?.label).toBe("Share your booking page");
    });

    it("uses the custom domain the read carries", () => {
        const link = shareLink(
            read(
                {
                    site: "https://shop.rye.in",
                    shop: "https://shop.rye.in/shop",
                },
                { origin: "https://shop.rye.in", customDomain: "shop.rye.in" },
            ),
            ORDERS_FIRST_RUN,
        );
        expect(link?.url).toBe("https://shop.rye.in/shop");
    });
});

describe("siteAddressOf — where a site is reached", () => {
    it("is the read's origin for the business's website", () => {
        expect(siteAddressOf({ subdomain: "rye" }, read({}), "x.test")).toEqual(
            {
                host: "rye.saroh.app",
                url: "https://rye.saroh.app",
                platformHost: "rye.saroh.app",
            },
        );
    });

    it("shows the verified custom domain, and keeps the Saroh address beside it", () => {
        expect(
            siteAddressOf(
                { subdomain: "rye" },
                read(
                    {},
                    {
                        origin: "https://shop.rye.in",
                        customDomain: "shop.rye.in",
                    },
                ),
                "x.test",
            ),
        ).toEqual({
            host: "shop.rye.in",
            url: "https://shop.rye.in",
            platformHost: "rye.saroh.app",
        });
    });

    it("puts another site of the business on the read's apex, not the domain", () => {
        expect(
            siteAddressOf(
                { subdomain: "rye-events" },
                read({}, { origin: "https://shop.rye.in" }),
                "x.test",
            ),
        ).toEqual({
            host: "rye-events.saroh.app",
            url: "https://rye-events.saroh.app",
            platformHost: "rye-events.saroh.app",
        });
    });

    it("reads the apex in dev from the API, not from a guess", () => {
        const dev = {
            address: "northwind",
            origin: "https://northwind.saroh.app.localhost",
            platformOrigin: "https://northwind.saroh.app.localhost",
        };
        expect(
            siteAddressOf({ subdomain: "other" }, dev, "saroh.app")?.host,
        ).toBe("other.saroh.app.localhost");
    });

    it("falls back to the site's subdomain without the read", () => {
        expect(
            siteAddressOf({ subdomain: "rye" }, null, "saroh.app")?.url,
        ).toBe("https://rye.saroh.app");
    });

    it("is null for a site with no address yet", () => {
        expect(
            siteAddressOf({ subdomain: null }, read({}), "saroh.app"),
        ).toBeNull();
    });
});
