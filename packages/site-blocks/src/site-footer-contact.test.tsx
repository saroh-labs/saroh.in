import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SOCIAL_LABELS, SOCIAL_NETWORKS } from "@saroh/block-contract";

import {
    hasContact,
    isSocialLink,
    NO_CONTACT,
    publicContactOf,
} from "./lib/public-contact";
import { SiteFooter } from "./site-chrome";
import type { SiteContact } from "./site-footer-contact";
import { addressDirectionsHref, shownContact } from "./site-footer-contact";
import { SocialIcon } from "./social-icons";

/**
 * The footer's contact group and social links (DEC-128): a phone as a
 * `tel:` link, an email as `mailto:`, where customers come with directions,
 * and the social links as named icons that open the network and nothing
 * else. Nothing is drawn for what isn't set.
 */

const WEEK = [
    { day: "MON", open: "06:00", close: "21:00", closed: false },
    { day: "TUE", open: "06:00", close: "21:00", closed: false },
    { day: "SUN", open: "06:00", close: "21:00", closed: true },
] as const;

const ALL: SiteContact = {
    phone: "+919845012345",
    email: "hello@rye.example.com",
    address: null,
    places: [
        {
            name: "Indiranagar",
            address: "12th Main\nIndiranagar, Bengaluru",
            hours: [...WEEK],
        },
    ],
    social: [
        { network: "instagram", url: "https://www.instagram.com/rye" },
        { network: "whatsapp", url: "https://wa.me/919845012345" },
        { network: "x", url: "https://x.com/rye" },
    ],
};

const footer = (contact: SiteContact | null, layout?: "left") =>
    render(
        <SiteFooter
            footer={layout ? { format: "markdown", value: "", layout } : null}
            name="Rye & Co."
            contact={contact}
        />,
    );

describe("the footer's contact group (DEC-128)", () => {
    it("draws the phone, the email, the place and the social links", () => {
        footer(ALL);

        expect(
            screen.getByRole("link", { name: "Call +91 98450 12345" }),
        ).toHaveAttribute("href", "tel:+919845012345");
        expect(
            screen.getByRole("link", { name: "hello@rye.example.com" }),
        ).toHaveAttribute("href", "mailto:hello@rye.example.com");

        // One place: its address on a line, unnamed, with its week.
        expect(
            screen.getByText("12th Main, Indiranagar, Bengaluru"),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Indiranagar:/)).toBeNull();
        expect(screen.getByText("Mon to Tue 6am to 9pm")).toBeInTheDocument();
        const directions = screen.getByRole("link", { name: "Get directions" });
        expect(directions).toHaveAttribute(
            "href",
            addressDirectionsHref("12th Main\nIndiranagar, Bengaluru"),
        );
        expect(directions.getAttribute("href")).toBe(
            "https://www.google.com/maps/search/?api=1&query=12th%20Main%2C%20Indiranagar%2C%20Bengaluru",
        );

        const social = screen.getByRole("list", { name: "Find us on" });
        const links = within(social).getAllByRole("link");
        expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
            "Instagram",
            "WhatsApp",
            "X",
        ]);
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "https://www.instagram.com/rye",
            "https://wa.me/919845012345",
            "https://x.com/rye",
        ]);
        for (const link of links) {
            expect(link).toHaveAttribute("target", "_blank");
            expect(link).toHaveAttribute("rel", "noopener noreferrer me");
            // A 44px target, with a mark that is not read out twice.
            expect(link.className).toContain("size-11");
            expect(link.querySelector("svg")).toHaveAttribute(
                "aria-hidden",
                "true",
            );
        }
    });

    it("draws only what is set", () => {
        footer({
            phone: null,
            email: null,
            address: null,
            places: [],
            social: [
                { network: "instagram", url: "https://www.instagram.com/rye" },
            ],
        });
        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.getByRole("link", { name: "Instagram" })).toBeVisible();
        expect(screen.queryByText(/Call/)).toBeNull();
        expect(
            screen.queryByRole("link", { name: "Get directions" }),
        ).toBeNull();
    });

    it("draws no group at all when nothing is set", () => {
        for (const contact of [
            null,
            { phone: null, email: null, address: null, places: [], social: [] },
            { phone: " ", email: "", address: "  " },
        ]) {
            const { container, unmount } = footer(contact);
            expect(container.querySelector("[data-site-contact]")).toBeNull();
            expect(screen.queryByRole("list")).toBeNull();
            // The footer's own line is all there is.
            expect(
                screen.getByRole("contentinfo").querySelectorAll("p"),
            ).toHaveLength(1);
            unmount();
        }
    });

    it("names each place when there is more than one", () => {
        footer({
            ...ALL,
            places: [
                { name: "Indiranagar", address: "12th Main" },
                { name: "Koramangala", address: "80 Feet Road" },
            ],
        });
        expect(screen.getByText("Indiranagar:")).toBeInTheDocument();
        expect(screen.getByText("Koramangala:")).toBeInTheDocument();
        expect(
            screen
                .getAllByRole("link", { name: "Get directions" })
                .map((a) => a.getAttribute("href")),
        ).toEqual([
            addressDirectionsHref("12th Main"),
            addressDirectionsHref("80 Feet Road"),
        ]);
    });

    it("opens a place's own Google Maps link for directions when it has one", () => {
        const map = "https://maps.app.goo.gl/AbC123xyZ";
        footer({
            ...ALL,
            places: [
                { name: "Indiranagar", address: "12th Main", mapUrl: map },
                { name: "Koramangala", address: "80 Feet Road", mapUrl: null },
            ],
        });
        expect(
            screen
                .getAllByRole("link", { name: "Get directions" })
                .map((a) => a.getAttribute("href")),
        ).toEqual([map, addressDirectionsHref("80 Feet Road")]);
    });

    it("searches for the address when the map link isn't Google's own", () => {
        footer({
            ...ALL,
            places: [
                {
                    name: "Indiranagar",
                    address: "12th Main",
                    mapUrl: "https://evil.example/maps",
                },
            ],
        });
        expect(
            screen.getByRole("link", { name: "Get directions" }),
        ).toHaveAttribute("href", addressDirectionsHref("12th Main"));
    });

    it("has no Google Maps icon among the social links", () => {
        footer({
            ...ALL,
            social: [
                ...(ALL.social ?? []),
                {
                    network: "googleMaps" as never,
                    url: "https://maps.app.goo.gl/AbC123xyZ",
                },
            ],
        });
        expect(screen.queryByRole("link", { name: "Google Maps" })).toBeNull();
        expect(
            within(
                screen.getByRole("list", { name: "Find us on" }),
            ).getAllByRole("link"),
        ).toHaveLength(3);
    });

    it("never draws a link that isn't a network's own address", () => {
        footer({
            phone: null,
            email: null,
            address: null,
            social: [
                { network: "instagram", url: "https://evil.example/rye" },
                { network: "x", url: "javascript:alert(1)" },
                { network: "facebook", url: "https://www.instagram.com/rye" },
                {
                    network: "myspace" as never,
                    url: "https://myspace.com/rye",
                },
                { network: "telegram", url: "https://t.me/rye_co" },
            ],
        });
        const links = screen.getAllByRole("link");
        expect(links).toHaveLength(1);
        expect(links[0]).toHaveAttribute("href", "https://t.me/rye_co");
    });

    it("keeps the one address line from before places could be listed", () => {
        footer({ phone: null, address: "12 Main Rd, Indiranagar" });
        expect(screen.getByText("12 Main Rd, Indiranagar")).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("draws the same group in the left layout", () => {
        const { container } = footer(ALL, "left");
        expect(container.querySelector("[data-site-contact]")).not.toBeNull();
        expect(
            screen.getByRole("link", { name: "Call +91 98450 12345" }),
        ).toHaveAttribute("href", "tel:+919845012345");
        expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
            "href",
            "https://www.instagram.com/rye",
        );
    });

    it("is drawn in the site's own footer colours, never a brand's", () => {
        const { container } = footer(ALL);
        const group = container.querySelector("[data-site-contact]");
        const html = group?.innerHTML ?? "";
        expect(html).toContain("ring-site-footer-fg");
        expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(html).not.toMatch(/\b(?:bg|text)-(?:primary|brand|accent)\b/);
        for (const svg of Array.from(group?.querySelectorAll("svg") ?? [])) {
            expect(svg).toHaveAttribute("stroke", "currentColor");
            expect(svg).toHaveAttribute("fill", "none");
        }
    });
});

describe("SocialIcon", () => {
    it("has a mark for every network", () => {
        for (const network of SOCIAL_NETWORKS) {
            const { container, unmount } = render(
                <SocialIcon network={network} />,
            );
            expect(
                container.querySelectorAll("path").length,
                SOCIAL_LABELS[network],
            ).toBeGreaterThan(0);
            unmount();
        }
    });
});

describe("shownContact", () => {
    it("drops blank values and places with no address", () => {
        expect(
            shownContact({
                phone: " ",
                email: " hi@rye.example.com ",
                address: "old line",
                places: [
                    { name: "A", address: "  " },
                    { name: "B", address: " 1 B Street " },
                ],
            }),
        ).toEqual({
            phone: null,
            email: "hi@rye.example.com",
            places: [{ name: "B", address: "1 B Street" }],
            address: null,
            social: [],
        });
    });
});

describe("publicContactOf", () => {
    const body = {
        phone: "+919845012345",
        email: " hello@rye.example.com ",
        places: [
            {
                source: "location",
                name: "Indiranagar",
                address: "12th Main",
                hours: null,
                mapUrl: "https://g.page/rye-bakery",
            },
        ],
        social: [
            { network: "instagram", url: "https://www.instagram.com/rye" },
        ],
    };

    it("narrows a good answer", () => {
        expect(publicContactOf(body)).toEqual({
            ...body,
            email: "hello@rye.example.com",
        });
        expect(hasContact(publicContactOf(body))).toBe(true);
    });

    it("leaves out a malformed place or link on its own", () => {
        const contact = publicContactOf({
            ...body,
            places: [...body.places, { source: "location", address: 3 }],
            social: [
                ...body.social,
                { network: "x", url: "https://evil.example" },
                "junk",
            ],
        });
        expect(contact?.places).toHaveLength(1);
        expect(contact?.social).toEqual(body.social);
    });

    it("keeps a place and drops its map link when the link isn't Google's own", () => {
        const [first] = body.places;
        const contact = publicContactOf({
            ...body,
            places: [
                { ...first, mapUrl: "https://evil.example/maps" },
                { ...first, name: "No link", mapUrl: undefined },
            ],
        });
        expect(contact?.places.map((p) => p.mapUrl)).toEqual([null, null]);
    });

    it("is null for anything that isn't the shape", () => {
        for (const junk of [
            null,
            "x",
            [],
            { phone: 3 },
            { ...body, social: 1 },
        ]) {
            expect(publicContactOf(junk)).toBeNull();
        }
    });

    it("says when there is nothing to draw", () => {
        expect(hasContact(NO_CONTACT)).toBe(false);
        expect(hasContact(null)).toBe(false);
    });

    it("accepts a link only on its own network's host", () => {
        expect(isSocialLink({ network: "x", url: "https://x.com/rye" })).toBe(
            true,
        );
        expect(isSocialLink({ network: "x", url: "@rye" })).toBe(false);
        expect(
            isSocialLink({ network: "x", url: "https://x.com.evil.example/r" }),
        ).toBe(false);
    });
});
