import { describe, expect, it } from "vitest";

import type { SitePrimaryAction } from "./site-primary-action";
import {
    contactPageHref,
    opensPrimaryAction,
    SITE_PRIMARY_ACTIONS,
    SITE_PRIMARY_ORDER,
    sitePrimaryAction,
    withoutPrimaryAction,
} from "./site-primary-action";

/**
 * The one thing a site asks of a visitor: which action leads, for every
 * combination of what a site has, and the menu never saying it twice.
 */

const BOOK: SitePrimaryAction = { kind: "book", label: "Book", href: "/book" };
const ORDER: SitePrimaryAction = {
    kind: "shop",
    label: "Order",
    href: "/shop",
};
const contact = (href: string): SitePrimaryAction => ({
    kind: "contact",
    label: "Contact us",
    href,
});

describe("the site's primary action", () => {
    it("is one action, or none, for every combination of what the site has", () => {
        const cases: [boolean, boolean, string | null, unknown][] = [
            // books, sells, contact page → the action
            [true, true, "/contact", BOOK],
            [true, true, null, BOOK],
            [true, false, "/contact", BOOK],
            [true, false, null, BOOK],
            [false, true, "/contact", ORDER],
            [false, true, null, ORDER],
            [false, false, "/contact", contact("/contact")],
            [false, false, null, null],
        ];
        for (const [books, sells, contactHref, expected] of cases) {
            expect(
                sitePrimaryAction({ books, sells, contactHref }),
                `books=${books} sells=${sells} contact=${contactHref}`,
            ).toEqual(expected);
        }
    });

    it("leads with booking, then the shop, then contact", () => {
        expect(SITE_PRIMARY_ORDER).toEqual(["book", "shop", "contact"]);
    });

    it("sends Contact us to wherever the site's contact page is", () => {
        expect(
            sitePrimaryAction({
                books: false,
                sells: false,
                contactHref: "/say-hello",
            }),
        ).toEqual(contact("/say-hello"));
    });

    it("reads a blank contact address as no contact page", () => {
        for (const contactHref of ["", "   ", null, undefined]) {
            expect(
                sitePrimaryAction({ books: false, sells: false, contactHref }),
            ).toBeNull();
        }
    });

    it("keeps each action's words and address in one place", () => {
        expect(SITE_PRIMARY_ACTIONS).toEqual({
            book: { label: "Book", href: "/book" },
            shop: { label: "Order", href: "/shop" },
            contact: { label: "Contact us", href: "/contact" },
        });
    });
});

describe("the site's contact page", () => {
    it("is its Contact module page, wherever the merchant put it", () => {
        expect(
            contactPageHref([
                { href: "/" },
                { href: "/say-hello", kind: "CONTACT" },
                { href: "/contact" },
            ]),
        ).toBe("/say-hello");
    });

    it("is a page of its own at /contact when there is no module page", () => {
        expect(
            contactPageHref([{ href: "/" }, { href: "/contact/", kind: null }]),
        ).toBe("/contact/");
        expect(contactPageHref([{ href: "/Contact", kind: "FREE" }])).toBe(
            "/Contact",
        );
    });

    it("is none while the Contact page's module is off", () => {
        expect(
            contactPageHref([{ href: "/say-hello", kind: "CONTACT" }], {
                CONTACT: "off",
            }),
        ).toBeNull();
        // A module whose state isn't known shows: never guessed off.
        expect(
            contactPageHref([{ href: "/say-hello", kind: "CONTACT" }], {}),
        ).toBe("/say-hello");
    });

    it("is never a jump to a section, or another module's page", () => {
        expect(
            contactPageHref([
                { href: "/#contact" },
                { href: "/contact", kind: "BOOK" },
                { href: "/about" },
            ]),
        ).toBeNull();
        expect(contactPageHref([])).toBeNull();
    });
});

describe("the menu doesn't repeat the primary action", () => {
    const MENU = [
        { label: "Home", href: "/" },
        { label: "About", href: "/about" },
        { label: "Shop", href: "/shop", kind: "SHOP" },
        { label: "Book a walkthrough", href: "/book", kind: "BOOK" },
        { label: "Contact", href: "/contact", kind: "CONTACT" },
    ];
    const labels = (items: { label: string }[]) => items.map((i) => i.label);

    it("leaves out the page each action opens, and only that one", () => {
        expect(labels(withoutPrimaryAction(MENU, BOOK))).toEqual([
            "Home",
            "About",
            "Shop",
            "Contact",
        ]);
        expect(labels(withoutPrimaryAction(MENU, ORDER))).toEqual([
            "Home",
            "About",
            "Book a walkthrough",
            "Contact",
        ]);
        expect(labels(withoutPrimaryAction(MENU, contact("/contact")))).toEqual(
            ["Home", "About", "Shop", "Book a walkthrough"],
        );
    });

    it("comes back as it was with no action", () => {
        expect(withoutPrimaryAction(MENU, null)).toEqual(MENU);
        expect(withoutPrimaryAction(MENU, undefined)).toEqual(MENU);
    });

    it("matches by the page's address when the entry has no kind", () => {
        const menu = [
            { label: "Home", href: "/" },
            { label: "Book online", href: "/book/" },
            { label: "Booking terms", href: "/booking-terms" },
        ];
        expect(labels(withoutPrimaryAction(menu, { href: "/book" }))).toEqual([
            "Home",
            "Booking terms",
        ]);
    });

    it("matches a module page by its kind, wherever it lives", () => {
        const menu = [
            { label: "Home", href: "/" },
            { label: "About", href: "/about" },
            { label: "Say hello", href: "/say-hello", kind: "CONTACT" },
        ];
        expect(
            labels(withoutPrimaryAction(menu, contact("/say-hello"))),
        ).toEqual(["Home", "About"]);
    });

    it("keeps a jump to a section: it is not the page", () => {
        const menu = [
            { label: "Home", href: "/" },
            { label: "Visit", href: "/#visit" },
            { label: "Book", href: "/book", kind: "BOOK" },
        ];
        expect(labels(withoutPrimaryAction(menu, BOOK))).toEqual([
            "Home",
            "Visit",
        ]);
        expect(opensPrimaryAction({ href: "/book#times" }, BOOK)).toBe(false);
    });

    it("draws no menu when Home is all that is left", () => {
        expect(
            withoutPrimaryAction(
                [
                    { label: "Home", href: "/" },
                    { label: "Shop", href: "/shop", kind: "SHOP" },
                ],
                ORDER,
            ),
        ).toEqual([]);
        // A menu the merchant published as Home alone is theirs.
        const home = [{ label: "Home", href: "/" }];
        expect(withoutPrimaryAction(home, ORDER)).toEqual(home);
    });
});
