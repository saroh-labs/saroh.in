import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SiteFooterContent } from "./site-chrome";
import {
    footerLine,
    SiteFooter,
    SiteHeader,
    siteMenu,
    withShopLink,
} from "./site-chrome";

/**
 * The customer site's v2 header and footer (G17): one row with the name,
 * the menu and "Book" at the desk, a menu button with a full-width "Book"
 * below 820px, and a footer that ends in "Runs on Saroh".
 *
 * jsdom has no layout, so "at the desk" and "at 390px" are the classes that
 * switch at 820px; the four scenes are checked in a browser.
 *
 * Its own file rather than `blocks.test.tsx`: G8 and G18 add to that file in
 * the same phase, and the header and footer are not blocks.
 */

const NAV = [
    { label: "Home", href: "/" },
    { label: "Classes", href: "/classes" },
    { label: "About", href: "/about" },
];
const BOOK = { label: "Book", href: "/book" };

/** The phone menu's list, found through the button that controls it. */
function menuList(button: HTMLElement): HTMLElement | null {
    return document.getElementById(button.getAttribute("aria-controls") ?? "");
}

function linkTexts(el: HTMLElement | null): (string | null)[] {
    return Array.from(el?.querySelectorAll("a") ?? []).map(
        (a) => a.textContent,
    );
}

describe("the site header (G17)", () => {
    it("draws Pulse at the desk: name, menu and Book in one row", () => {
        const { container } = render(
            <SiteHeader name="Pulse Fitness" navigation={NAV} action={BOOK} />,
        );
        const home = screen.getByRole("link", {
            name: "Pulse Fitness — home",
        });
        expect(home).toHaveAttribute("href", "/");
        expect(home.querySelector("span")).toHaveClass("font-site-heading");

        const row = screen.getByRole("navigation", { name: "Site" });
        expect(row).toHaveClass("hidden", "min-[820px]:flex");
        expect(linkTexts(row)).toEqual(["Home", "Classes", "About"]);

        const book = screen.getByRole("link", { name: "Book" });
        expect(book).toHaveAttribute("href", "/book");
        expect(book).toHaveClass("hidden", "min-[820px]:inline-flex");
        expect(book).toHaveClass("bg-site-accent", "text-site-accent-fg");

        expect(container.innerHTML).toMatchSnapshot();
    });

    it("folds into a menu button below 820px, with a full-width Book", () => {
        const { container } = render(
            <SiteHeader name="Pulse Fitness" navigation={NAV} action={BOOK} />,
        );
        const button = screen.getByRole("button", { name: "Menu" });
        expect(button).toHaveClass("min-[820px]:hidden");
        expect(button).toHaveAttribute("aria-expanded", "false");
        expect(menuList(button)).toBeNull();

        act(() => button.click());
        expect(button).toHaveAttribute("aria-expanded", "true");
        const list = menuList(button);
        expect(list).toHaveClass("min-[820px]:hidden");
        expect(linkTexts(list)).toEqual(["Home", "Classes", "About", "Book"]);
        const book = list?.querySelector("a:last-child");
        expect(book).toHaveAttribute("href", "/book");
        expect(book).toHaveClass("w-full");

        expect(container.innerHTML).toMatchSnapshot();
    });

    it("closes the menu when an entry is chosen, and on Escape", () => {
        render(
            <SiteHeader name="Pulse Fitness" navigation={NAV} action={BOOK} />,
        );
        const button = screen.getByRole("button", { name: "Menu" });

        act(() => button.click());
        const about = Array.from(
            menuList(button)?.querySelectorAll("a") ?? [],
        ).find((a) => a.textContent === "About");
        // jsdom does not navigate; the click's own handler is what's tested.
        about?.addEventListener("click", (e) => e.preventDefault());
        act(() => about?.click());
        expect(button).toHaveAttribute("aria-expanded", "false");
        expect(menuList(button)).toBeNull();

        act(() => button.click());
        expect(menuList(button)).not.toBeNull();
        act(() => {
            button.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(menuList(button)).toBeNull();
    });

    it("draws no main button and no menu button for a site with neither", () => {
        render(<SiteHeader name="Kavi Dental" navigation={[]} />);
        expect(
            screen.getByRole("link", { name: "Kavi Dental — home" }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByRole("navigation")).toBeNull();
        expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("keeps a menu button for a menu with no main button", () => {
        render(<SiteHeader name="Kavi Dental" navigation={NAV} />);
        const button = screen.getByRole("button", { name: "Menu" });
        act(() => button.click());
        expect(linkTexts(menuList(button))).toEqual([
            "Home",
            "Classes",
            "About",
        ]);
        expect(screen.queryByRole("link", { name: "Book" })).toBeNull();
    });

    it("says Order, to /shop, when that is the main button", () => {
        render(
            <SiteHeader
                name="Rye Bakery"
                navigation={[]}
                action={{ label: "Order", href: "/shop" }}
            />,
        );
        expect(screen.getByRole("link", { name: "Order" })).toHaveAttribute(
            "href",
            "/shop",
        );
        // A main button alone still needs a way in on a phone.
        const button = screen.getByRole("button", { name: "Menu" });
        act(() => button.click());
        expect(linkTexts(menuList(button))).toEqual(["Order"]);
    });

    it("keeps every link inside a draft preview", () => {
        render(
            <SiteHeader
                name="Pulse Fitness"
                navigation={NAV}
                action={BOOK}
                basePath="/preview/tok"
            />,
        );
        expect(
            screen.getByRole("link", { name: "Pulse Fitness — home" }),
        ).toHaveAttribute("href", "/preview/tok");
        expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute(
            "href",
            "/preview/tok/classes",
        );
        expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute(
            "href",
            "/preview/tok/book",
        );
    });

    it("marks the page you are on in the menu", () => {
        window.history.pushState({}, "", "/classes/");
        try {
            render(<SiteHeader name="Pulse Fitness" navigation={NAV} />);
            const current = screen.getByRole("link", { name: "Classes" });
            expect(current).toHaveAttribute("aria-current", "page");
            expect(current).toHaveClass("bg-site-fg", "text-site-bg");
            expect(
                screen.getByRole("link", { name: "About" }),
            ).not.toHaveAttribute("aria-current");
            expect(
                screen.getByRole("link", { name: "Home" }),
            ).not.toHaveAttribute("aria-current");
        } finally {
            window.history.pushState({}, "", "/");
        }
    });

    it("draws the bag and account slots only when they are given", () => {
        const { rerender } = render(
            <SiteHeader name="Pulse Fitness" navigation={[]} />,
        );
        expect(screen.queryByTestId("bag")).toBeNull();
        expect(screen.queryByTestId("account")).toBeNull();

        rerender(
            <SiteHeader
                name="Pulse Fitness"
                navigation={[]}
                bag={<span data-testid="bag">Bag · 2</span>}
                account={<span data-testid="account">Sign in</span>}
            />,
        );
        expect(screen.getByTestId("bag")).toBeInTheDocument();
        expect(screen.getByTestId("account")).toBeInTheDocument();
    });

    it("sets nothing in Saroh's type or colours", () => {
        const { container } = render(
            <>
                <SiteHeader
                    name="Pulse Fitness"
                    navigation={NAV}
                    action={BOOK}
                />
                <SiteFooter footer={null} name="Pulse Fitness" />
            </>,
        );
        act(() => screen.getByRole("button", { name: "Menu" }).click());
        expect(container.innerHTML).not.toMatch(
            /\bfont-(sans|display|mono)\b|\b(bg|text|border|ring)-(primary|secondary|brand|foreground|background|muted|accent|card|border|ring)\b(?!-)/,
        );
    });
});

describe("the site footer (G17)", () => {
    const runsOn = () => screen.getByRole("link", { name: "Runs on Saroh" });

    it("ends in Runs on Saroh, linking to saroh.in in a new tab", () => {
        const { container } = render(
            <SiteFooter
                footer={{ format: "markdown", value: "Pulse · Indiranagar" }}
                name="Pulse Fitness"
            />,
        );
        expect(runsOn()).toHaveAttribute("href", "https://saroh.in");
        expect(runsOn()).toHaveAttribute("target", "_blank");
        expect(runsOn()).toHaveAttribute("rel", "noopener");
        expect(runsOn().closest("p")?.textContent).toBe(
            "Pulse · Indiranagar · Runs on Saroh",
        );
        // The merchant's footer colours, not Saroh's.
        expect(screen.getByRole("contentinfo")).toHaveClass(
            "bg-site-footer-bg",
            "text-site-footer-fg",
            "font-site-body",
        );
        expect(container.innerHTML).toMatchSnapshot();
    });

    it("uses the site's name when the merchant wrote nothing", () => {
        const empties: (SiteFooterContent | null)[] = [
            null,
            { format: "html", value: "  " },
        ];
        for (const footer of empties) {
            const { unmount } = render(
                <SiteFooter footer={footer} name="Kavi Dental" />,
            );
            expect(runsOn().closest("p")?.textContent).toBe(
                "Kavi Dental · Runs on Saroh",
            );
            unmount();
        }
    });

    it("keeps a one-paragraph html footer on the same line", () => {
        render(
            <SiteFooter
                footer={{
                    format: "html",
                    value: "<p>Rye · <strong>Koramangala</strong></p>",
                }}
                name="Rye"
            />,
        );
        const line = runsOn().closest("p");
        expect(line?.textContent).toBe("Rye · Koramangala · Runs on Saroh");
        expect(line?.querySelector("strong")?.textContent).toBe("Koramangala");
    });

    it("puts Runs on Saroh on its own line under a longer footer", () => {
        const { container } = render(
            <SiteFooter
                footer={{
                    format: "html",
                    value: "<p>Rye Bakery</p><p>Open 7am to 7pm</p>",
                }}
                name="Rye"
            />,
        );
        expect(container.querySelector(".prose")?.innerHTML).toBe(
            "<p>Rye Bakery</p><p>Open 7am to 7pm</p>",
        );
        expect(runsOn().closest("p")?.textContent).toBe("Runs on Saroh");
    });

    it("keeps a plain footer's line breaks", () => {
        const { container } = render(
            <SiteFooter
                footer={{ format: "markdown", value: "Rye\nKoramangala" }}
                name="Rye"
            />,
        );
        expect(
            container.querySelector(".whitespace-pre-wrap")?.textContent,
        ).toBe("Rye\nKoramangala");
        expect(runsOn().closest("p")?.textContent).toBe("Runs on Saroh");
    });
});

describe("footerLine", () => {
    it.each([
        [{ format: "markdown", value: " One line " }, "text", "One line"],
        [
            { format: "html", value: "<p>A <em>b</em></p>" },
            "html",
            "A <em>b</em>",
        ],
    ] as const)("reads %j as one line", (footer, kind, value) => {
        expect(footerLine(footer)).toEqual({ kind, value });
    });

    it.each([
        { format: "markdown", value: "One\nTwo" },
        { format: "html", value: "<p>One</p><p>Two</p>" },
        { format: "html", value: "<p>One<br>Two</p>" },
        { format: "html", value: "<ul><li>One</li></ul>" },
        { format: "html", value: "<h2>Hi</h2>" },
        { format: "html", value: "Bare text" },
    ] as const)("reads %j as more than a line", (footer) => {
        expect(footerLine(footer)).toBeNull();
    });
});

describe("module pages in the menu (G15)", () => {
    // What G14 publishes for a site with no menu of its own: its module
    // pages, in the kinds' order, each carrying its kind.
    const MODULE_MENU = [
        { label: "Book", href: "/book", kind: "BOOK" },
        { label: "Prices", href: "/prices", kind: "PRICES" },
        { label: "Journal", href: "/journal", kind: "JOURNAL" },
        { label: "Contact", href: "/contact", kind: "CONTACT" },
    ];

    const hrefs = (el: HTMLElement) =>
        Array.from(el.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    it("reads Home · Book · Prices · Journal · Contact on Pulse", () => {
        render(<SiteHeader name="Pulse Fitness" navigation={MODULE_MENU} />);
        const row = screen.getByRole("navigation", { name: "Site" });
        expect(linkTexts(row)).toEqual([
            "Home",
            "Book",
            "Prices",
            "Journal",
            "Contact",
        ]);
        expect(hrefs(row)).toEqual([
            "/",
            "/book",
            "/prices",
            "/journal",
            "/contact",
        ]);
    });

    it("keeps Book after Home, in the editor's order", () => {
        expect(
            siteMenu([
                { label: "Journal", href: "/journal", kind: "JOURNAL" },
                { label: "Book", href: "/book", kind: "BOOK" },
            ]).map((i) => i.label),
        ).toEqual(["Home", "Journal", "Book"]);
    });

    it("takes Book out while Appointments is off", () => {
        render(
            <SiteHeader
                name="Pulse Fitness"
                navigation={MODULE_MENU}
                modules={{
                    BOOK: "off",
                    PRICES: "on",
                    JOURNAL: "on",
                    CONTACT: "on",
                }}
            />,
        );
        const row = screen.getByRole("navigation", { name: "Site" });
        expect(linkTexts(row)).toEqual([
            "Home",
            "Prices",
            "Journal",
            "Contact",
        ]);
    });

    it("shows a module page whose state isn't known: it never guesses off", () => {
        expect(
            siteMenu(MODULE_MENU, { PRICES: "off" }).map((i) => i.label),
        ).toEqual(["Home", "Book", "Journal", "Contact"]);
        expect(siteMenu(MODULE_MENU, null)).toHaveLength(5);
    });

    it("draws no menu once every module page is off, not Home alone", () => {
        expect(
            siteMenu([{ label: "Book", href: "/book", kind: "BOOK" }], {
                BOOK: "off",
            }),
        ).toEqual([]);
    });

    it("leaves the merchant's own menu as it is: no Home added", () => {
        const own = [
            { label: "Classes", href: "/classes" },
            { label: "Book", href: "/book", kind: "BOOK" },
        ];
        expect(siteMenu(own)).toEqual(own);
        expect(siteMenu(own, { BOOK: "off" })).toEqual([
            { label: "Classes", href: "/classes" },
        ]);
    });

    it("draws an existing site's menu exactly as published", () => {
        expect(siteMenu(NAV)).toEqual(NAV);
        expect(siteMenu([])).toEqual([]);
    });

    it("keeps Home inside a draft preview, and drops a module that is off there too (G19)", () => {
        render(
            <SiteHeader
                name="Pulse Fitness"
                navigation={MODULE_MENU}
                basePath="/preview/tok"
                modules={{ BOOK: "off" }}
            />,
        );
        const row = screen.getByRole("navigation", { name: "Site" });
        expect(hrefs(row)).toEqual([
            "/preview/tok",
            "/preview/tok/prices",
            "/preview/tok/journal",
            "/preview/tok/contact",
        ]);
    });

    it("keeps Home inside a draft preview", () => {
        render(
            <SiteHeader
                name="Pulse Fitness"
                navigation={MODULE_MENU.slice(0, 1)}
                basePath="/preview/tok"
            />,
        );
        const row = screen.getByRole("navigation", { name: "Site" });
        expect(hrefs(row)).toEqual(["/preview/tok", "/preview/tok/book"]);
    });
});

describe("the menu follows the modules (G19)", () => {
    // A shop and studio's menu as publish resolves it: the merchant's own
    // entries, then its module pages, each carrying its kind.
    const MENU = [
        { label: "Home", href: "/" },
        { label: "Our story", href: "/about" },
        { label: "Shop", href: "/shop", kind: "SHOP" },
        { label: "Book", href: "/book", kind: "BOOK" },
        { label: "Contact", href: "/contact", kind: "CONTACT" },
    ];
    const ORDER = { label: "Order", href: "/shop" };

    it("takes Shop and Order away once Commerce is off, without a republish", () => {
        const { rerender } = render(
            <SiteHeader
                name="Rye"
                navigation={MENU}
                modules={{ SHOP: "on", BOOK: "off", CONTACT: "on" }}
                action={ORDER}
            />,
        );
        const row = () => screen.getByRole("navigation", { name: "Site" });
        expect(linkTexts(row())).toEqual([
            "Home",
            "Our story",
            "Shop",
            "Contact",
        ]);
        expect(screen.getAllByRole("link", { name: "Order" })).toHaveLength(1);

        // Commerce off: the same snapshot, the live read says SHOP is off,
        // and the layout's main button (`headerAction`) is none.
        rerender(
            <SiteHeader
                name="Rye"
                navigation={MENU}
                modules={{ SHOP: "off", BOOK: "off", CONTACT: "on" }}
                action={null}
            />,
        );
        expect(linkTexts(row())).toEqual(["Home", "Our story", "Contact"]);
        expect(screen.queryByRole("link", { name: "Order" })).toBeNull();
    });

    it("keeps the menu's own order: a module page stays where it was put", () => {
        const placed = [
            { label: "Book", href: "/book", kind: "BOOK" },
            { label: "Home", href: "/" },
            { label: "Shop", href: "/shop", kind: "SHOP" },
            { label: "About", href: "/about" },
        ];
        expect(
            siteMenu(placed, { BOOK: "on", SHOP: "off" }).map((i) => i.label),
        ).toEqual(["Book", "Home", "About"]);
    });

    it("keeps a hand-made entry to a free-form page, whatever is off", () => {
        const own = [
            { label: "Home", href: "/" },
            { label: "Menu", href: "/menu" },
            { label: "Shop", href: "/shop", kind: "SHOP" },
        ];
        expect(
            siteMenu(own, {
                SHOP: "off",
                BOOK: "off",
                PRICES: "off",
                JOURNAL: "off",
                CONTACT: "off",
            }),
        ).toEqual([
            { label: "Home", href: "/" },
            { label: "Menu", href: "/menu" },
        ]);
    });

    it("draws no menu when Home is all a module going off leaves", () => {
        const menu = [
            { label: "Home", href: "/" },
            { label: "Shop", href: "/shop", kind: "SHOP" },
        ];
        expect(siteMenu(menu, { SHOP: "off" })).toEqual([]);
        render(
            <SiteHeader
                name="Rye"
                navigation={menu}
                modules={{ SHOP: "off" }}
            />,
        );
        expect(screen.queryByRole("navigation", { name: "Site" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    });

    it("brings a module page back when its module is on again", () => {
        const menu = [
            { label: "Home", href: "/" },
            { label: "Shop", href: "/shop", kind: "SHOP" },
        ];
        expect(siteMenu(menu, { SHOP: "on" })).toEqual(menu);
    });

    it("draws a site that never added module pages exactly as published", () => {
        // A merchant who published Home alone keeps it: nothing was taken.
        const homeOnly = [{ label: "Home", href: "/" }];
        expect(siteMenu(homeOnly, { SHOP: "off" })).toEqual(homeOnly);
        expect(siteMenu(NAV, { SHOP: "off", BOOK: "off" })).toEqual(NAV);
    });
});

describe("a Shop link in the header while the shop serves (P4)", () => {
    const SHOP = { label: "Shop", href: "/shop", kind: "SHOP" };

    it("adds Shop after Home when the shop serves", () => {
        expect(withShopLink(NAV, true).map((i) => i.label)).toEqual([
            "Home",
            "Shop",
            "Classes",
            "About",
        ]);
        render(<SiteHeader name="Rye" navigation={NAV} shopServes />);
        const row = screen.getByRole("navigation", { name: "Site" });
        expect(linkTexts(row)).toEqual(["Home", "Shop", "Classes", "About"]);
        const shop = Array.from(row.querySelectorAll("a")).find(
            (a) => a.textContent === "Shop",
        );
        expect(shop).toHaveAttribute("href", "/shop");
    });

    it("gives a site with no menu Home · Shop", () => {
        expect(withShopLink([], true)).toEqual([
            { label: "Home", href: "/" },
            SHOP,
        ]);
    });

    it("keeps a menu that already opens the shop as it is", () => {
        const own = [
            { label: "Home", href: "/" },
            { label: "Bakery", href: "/shop/" },
        ];
        expect(withShopLink(own, true)).toEqual(own);
        const page = [{ label: "Home", href: "/" }, SHOP];
        expect(withShopLink(page, true)).toEqual(page);
    });

    it("adds nothing while the shop doesn't serve", () => {
        expect(withShopLink(NAV, false)).toEqual(NAV);
        expect(withShopLink([], false)).toEqual([]);
        render(<SiteHeader name="Rye" navigation={NAV} />);
        expect(
            linkTexts(screen.getByRole("navigation", { name: "Site" })),
        ).toEqual(["Home", "Classes", "About"]);
    });
});

describe("the header's controls look pressable (G19)", () => {
    const MENU = [
        { label: "Home", href: "/" },
        { label: "Classes", href: "/classes" },
    ];

    it("gives every menu entry, the name and the main button a pointer, a hover and a pressed state", () => {
        render(<SiteHeader name="Pulse" navigation={MENU} action={BOOK} />);
        const row = screen.getByRole("navigation", { name: "Site" });
        for (const a of Array.from(row.querySelectorAll("a"))) {
            expect(a.className).toContain("cursor-pointer");
            expect(a.className).toMatch(/\bactive:/);
            expect(a.className).toContain("focus-visible:ring-2");
        }
        // Not the page you're on: it has a hover.
        const classes = screen.getByRole("link", { name: "Classes" });
        expect(classes.className).toContain("hover:bg-site-border/40");

        const name = screen.getByRole("link", { name: "Pulse — home" });
        expect(name.className).toContain("cursor-pointer");
        expect(name.className).toMatch(/\bhover:/);
        expect(name.className).toMatch(/\bactive:/);

        const book = screen
            .getAllByRole("link", { name: "Book" })
            .find((a) => a.className.includes("min-[820px]:inline-flex"));
        expect(book?.className).toContain("cursor-pointer");
        expect(book?.className).toContain("active:opacity-80");
    });

    it("gives the phone menu's button and entries the same states", () => {
        render(<SiteHeader name="Pulse" navigation={MENU} action={BOOK} />);
        const button = screen.getByRole("button", { name: "Menu" });
        expect(button.className).toContain("cursor-pointer");
        expect(button.className).toMatch(/\bhover:/);
        expect(button.className).toMatch(/\bactive:/);
        // Open, it looks pressed as well as saying so.
        expect(button.className).toContain("aria-expanded:bg-site-border/40");

        act(() => button.click());
        const list = menuList(button);
        const links = Array.from(list?.querySelectorAll("a") ?? []);
        expect(links.length).toBeGreaterThan(0);
        for (const a of links) {
            expect(a.className).toContain("cursor-pointer");
            expect(a.className).toMatch(/\bactive:/);
            expect(a.className).toContain("focus-visible:ring-2");
        }
    });

    it("draws the states in the site's own tokens, never Saroh's", () => {
        const { container } = render(
            <SiteHeader name="Pulse" navigation={MENU} action={BOOK} />,
        );
        act(() => screen.getByRole("button", { name: "Menu" }).click());
        expect(container.innerHTML).not.toMatch(
            /\b(?:hover|active):(?:bg|text)-(?:primary|muted|accent|border|foreground|background)\b/,
        );
    });
});
