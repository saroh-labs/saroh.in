import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./site-chrome";
import type { SiteHeaderAction } from "./site-header-menu";

/**
 * The header's craft (the starter site work): one primary action that the
 * menu never repeats, the business's mark beside its name, a row that
 * never loses its actions, and a phone menu that holds focus and closes
 * the ways a visitor expects.
 *
 * jsdom has no layout, so widths are the classes that hold them; the four
 * scenes are checked in a browser.
 */

const MENU = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Shop", href: "/shop", kind: "SHOP" },
    { label: "Book a walkthrough", href: "/book", kind: "BOOK" },
    { label: "Contact", href: "/contact", kind: "CONTACT" },
];
const BOOK: SiteHeaderAction = { kind: "book", label: "Book", href: "/book" };
const ORDER: SiteHeaderAction = { kind: "shop", label: "Order", href: "/shop" };
const CONTACT: SiteHeaderAction = {
    kind: "contact",
    label: "Contact us",
    href: "/contact",
};

const row = () => screen.getByRole("navigation", { name: "Site" });
const texts = (el: Element | null) =>
    Array.from(el?.querySelectorAll("a") ?? []).map((a) => a.textContent);
/** An element a test has just said is on the page. */
function there<T extends Element>(el: T | null): T {
    if (el === null) throw new Error("not on the page");
    return el;
}
const menuButton = () => screen.getByRole("button", { name: "Menu" });
const panel = () =>
    document.getElementById(menuButton().getAttribute("aria-controls") ?? "");

describe("one primary action in the header", () => {
    it("shows Book once, and the menu doesn't list the booking page too", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} action={BOOK} />);
        expect(texts(row())).toEqual(["Home", "About", "Shop", "Contact"]);
        expect(screen.queryByText("Book a walkthrough")).toBeNull();
        expect(screen.getAllByRole("link", { name: "Book" })).toHaveLength(1);
    });

    it("leaves Shop out of the menu beside Order, and Contact beside Contact us", () => {
        const { unmount } = render(
            <SiteHeader name="Northwind" navigation={MENU} action={ORDER} />,
        );
        expect(texts(row())).toEqual([
            "Home",
            "About",
            "Book a walkthrough",
            "Contact",
        ]);
        unmount();

        render(
            <SiteHeader name="Northwind" navigation={MENU} action={CONTACT} />,
        );
        expect(texts(row())).toEqual([
            "Home",
            "About",
            "Shop",
            "Book a walkthrough",
        ]);
    });

    it("doesn't add a Shop entry back beside Order while the shop serves", () => {
        render(
            <SiteHeader
                name="Northwind"
                navigation={[
                    { label: "Home", href: "/" },
                    { label: "About", href: "/about" },
                ]}
                action={ORDER}
                shopServes
            />,
        );
        expect(texts(row())).toEqual(["Home", "About"]);
    });

    it("keeps the whole menu when there is no main button", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} />);
        expect(texts(row())).toHaveLength(MENU.length);
    });

    it("says it once in the phone menu too: the pages, then the button at the foot", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} action={BOOK} />);
        act(() => menuButton().click());
        expect(texts(panel())).toEqual([
            "Home",
            "About",
            "Shop",
            "Contact",
            "Book",
        ]);
    });

    it("keeps the button inside a draft preview, and still drops its page from the menu", () => {
        render(
            <SiteHeader
                name="Northwind"
                navigation={MENU}
                action={BOOK}
                basePath="/preview/tok"
            />,
        );
        expect(texts(row())).toEqual(["Home", "About", "Shop", "Contact"]);
        expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute(
            "href",
            "/preview/tok/book",
        );
    });
});

describe("the business's mark beside its name (DEC-124)", () => {
    it("draws the logo when the site has one, unnamed, beside the name", () => {
        render(
            <SiteHeader
                name="Rye & Co."
                navigation={[]}
                logo={{ url: "https://media.example.com/rye.png" }}
            />,
        );
        const home = screen.getByRole("link", { name: "Rye & Co., home" });
        const mark = home.querySelector("img");
        expect(mark).toHaveAttribute(
            "src",
            "https://media.example.com/rye.png",
        );
        // The name beside it says whose it is: the mark isn't read twice.
        expect(mark).toHaveAttribute("alt", "");
        // Held to the row's height, never wider than a name would be.
        expect(mark).toHaveClass("h-8", "w-auto", "object-contain");
        expect(mark?.className).toContain("max-w-[7.5rem]");
        expect(home.textContent).toBe("Rye & Co.");
    });

    it("draws the name alone without one", () => {
        for (const logo of [null, undefined, { url: "  " }]) {
            const { unmount } = render(
                <SiteHeader name="Rye & Co." navigation={[]} logo={logo} />,
            );
            expect(document.querySelector("header img")).toBeNull();
            unmount();
        }
    });
});

describe("a long name or a long menu never pushes the actions off the row", () => {
    const LONG =
        "The Northwind Supply and Provisioning Company of Greater Bengaluru";

    it("cuts a long name with an ellipsis, and still says all of it", () => {
        render(
            <SiteHeader
                name={LONG}
                navigation={MENU}
                action={BOOK}
                bag={<button type="button">Bag</button>}
                account={<button type="button">Sign in</button>}
            />,
        );
        const home = screen.getByRole("link", { name: `${LONG}, home` });
        // The link may shrink below its words, and the words then truncate.
        expect(home).toHaveClass("min-w-0");
        expect(home).toHaveClass("flex-[0_1_auto]");
        expect(home.querySelector("span")).toHaveClass("truncate");
        expect(home).toHaveAttribute("title", LONG);
        // What sits after it holds its size.
        expect(screen.getByRole("link", { name: "Book" })).toHaveClass(
            "shrink-0",
        );
        expect(menuButton()).toHaveClass("shrink-0");
        expect(screen.getByRole("button", { name: "Bag" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    });

    it("lets a long menu scroll inside its own part of the row", () => {
        const many = Array.from({ length: 14 }, (_, i) => ({
            label: `Page ${i + 1}`,
            href: `/page-${i + 1}`,
        }));
        render(<SiteHeader name="Rye" navigation={many} action={BOOK} />);
        expect(row()).toHaveClass("min-w-0", "overflow-x-auto");
        // Every entry is still there, a Tab away.
        expect(texts(row())).toHaveLength(14);
        for (const a of Array.from(row().querySelectorAll("a"))) {
            expect(a).toHaveClass("shrink-0");
        }
    });
});

describe("the phone menu", () => {
    const open = () => {
        render(
            <SiteHeader
                name="Northwind"
                navigation={MENU}
                action={BOOK}
                bag={<button type="button">Bag</button>}
                account={<button type="button">Sign in</button>}
            />,
        );
        act(() => menuButton().click());
    };
    const key = (init: KeyboardEventInit) =>
        act(() => {
            fireEvent.keyDown(document.activeElement ?? document.body, init);
        });

    it("reaches every entry, each a 44px target or more", () => {
        open();
        const links = Array.from(panel()?.querySelectorAll("a") ?? []);
        expect(links).toHaveLength(5);
        for (const a of links.slice(0, -1)) {
            expect(a).toHaveClass("min-h-12");
        }
        expect(links.at(-1)).toHaveClass("h-12", "w-full");
        expect(menuButton()).toHaveClass("size-11");
        // A menu taller than the screen scrolls inside the panel.
        expect(panel()).toHaveClass("overflow-y-auto");
        expect(panel()?.className).toContain("max-h-[calc(100dvh-5rem)]");
    });

    it("keeps the bag and the account in the row while it is open", () => {
        open();
        expect(screen.getByRole("button", { name: "Bag" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    });

    it("holds Tab inside: from the last entry to the button, and back", () => {
        open();
        const links = Array.from(panel()?.querySelectorAll("a") ?? []);
        const last = links.at(-1);

        act(() => last?.focus());
        key({ key: "Tab" });
        expect(document.activeElement).toBe(menuButton());

        key({ key: "Tab" });
        expect(document.activeElement).toBe(links[0]);

        act(() => menuButton().focus());
        key({ key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(last);

        // Focus that strayed outside comes back to the start.
        act(() => screen.getByRole("button", { name: "Bag" }).focus());
        key({ key: "Tab" });
        expect(document.activeElement).toBe(menuButton());
    });

    it("leaves Tab alone while it is closed", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} action={BOOK} />);
        act(() => menuButton().focus());
        const event = new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
        });
        act(() => {
            menuButton().dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(false);
    });

    it("closes on Escape and gives focus back to the button", () => {
        open();
        act(() => panel()?.querySelector("a")?.focus());
        key({ key: "Escape" });
        expect(panel()).toBeNull();
        expect(menuButton()).toHaveAttribute("aria-expanded", "false");
        expect(document.activeElement).toBe(menuButton());
    });

    it("closes on a press outside it, and not on a press inside", () => {
        open();
        act(() => {
            fireEvent.pointerDown(there(panel()));
        });
        expect(panel()).not.toBeNull();

        act(() => {
            fireEvent.pointerDown(document.body);
        });
        expect(panel()).toBeNull();
    });

    it("dims the page behind it with the site's own ink, and closes on a press there", () => {
        open();
        const scrim = document.querySelector("[data-site-menu-scrim]");
        expect(scrim).toHaveAttribute("aria-hidden", "true");
        expect(scrim).toHaveClass("bg-site-fg/30");
        act(() => {
            fireEvent.pointerDown(there(scrim));
        });
        expect(panel()).toBeNull();
        expect(document.querySelector("[data-site-menu-scrim]")).toBeNull();
    });
});

describe("the header's states", () => {
    it("gives every control a focus ring in the site's own tokens", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} action={BOOK} />);
        act(() => menuButton().click());
        const controls = [
            ...Array.from(document.querySelectorAll("header a")),
            menuButton(),
        ];
        expect(controls.length).toBeGreaterThan(8);
        for (const el of controls) {
            expect(el.className, el.textContent).toContain(
                "focus-visible:ring-2",
            );
            expect(el.className).toMatch(/focus-visible:ring-site-/);
        }
    });

    it("keeps the rings readable over a full-bleed hero's photo", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} action={BOOK} />);
        const over =
            "[body:has([data-site-first-hero])_&]:focus-visible:ring-site-bg";
        expect(
            screen.getByRole("link", { name: "Northwind, home" }).className,
        ).toContain(over);
        expect(screen.getByRole("link", { name: "About" }).className).toContain(
            over,
        );
        expect(screen.getByRole("link", { name: "Book" }).className).toContain(
            over,
        );
        expect(menuButton().className).toContain(over);
    });

    it("moves on one short curve, colour, opacity and transform only", () => {
        render(<SiteHeader name="Northwind" navigation={MENU} action={BOOK} />);
        for (const el of [
            screen.getByRole("link", { name: "About" }),
            screen.getByRole("link", { name: "Book" }),
            menuButton(),
        ]) {
            expect(el.className).toContain("duration-150");
            expect(el.className).toContain(
                "ease-[cubic-bezier(0.2,0.8,0.2,1)]",
            );
            expect(el.className).not.toContain("transition-all");
        }
    });
});
