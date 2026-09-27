import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SiteFooterContent } from "./site-chrome";
import { footerLine, SiteFooter, SiteHeader } from "./site-chrome";

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
