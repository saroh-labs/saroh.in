// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteNav } from "./site-nav";

/**
 * The nav (plan U19): the current section underlined with the page marked
 * `aria-current`, menus that close on Esc and outside click with focus back
 * on their button, arrow keys inside a menu, and the phone sheet opening on
 * the current section.
 */
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

beforeEach(() => {
    // jsdom has no matchMedia; the phone sheet listens for widening.
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
});
afterEach(() => {
    cleanup();
    pathname = "/";
});

const desktop = () => screen.getByRole("navigation", { name: "Main" });
const button = (name: string) =>
    screen.getAllByRole("button", { name: new RegExp(`^${name}`) })[0];

describe("SiteNav", () => {
    it("on /features/orders, underlines Features and marks Orders as the page", () => {
        pathname = "/features/orders";
        render(<SiteNav />);
        const features = button("Features");
        expect(features.className).toMatch(/(^| )underline( |$)/);
        expect(features.className).toContain("decoration-brand-500");
        expect(button("Solutions").className).not.toMatch(
            /(^| )underline( |$)/,
        );

        fireEvent.click(features);
        const orders = screen.getByRole("menuitem", { name: /^Orders/ });
        expect(orders.getAttribute("aria-current")).toBe("page");
        expect(orders.getAttribute("href")).toBe("/features/orders");
        expect(
            screen
                .getByRole("menuitem", { name: /^Products/ })
                .getAttribute("aria-current"),
        ).toBeNull();
    });

    it("has no Pricing link: Pricing isn't published yet", () => {
        render(<SiteNav />);
        expect(screen.queryAllByRole("link", { name: "Pricing" })).toEqual([]);
        expect(document.querySelector('a[href^="/pricing"]')).toBeNull();
    });

    it("Features opens a menu of eight, focused on the first", () => {
        render(<SiteNav />);
        const chevron = () =>
            button("Features").querySelector("[data-chevron]")?.classList;
        expect(chevron()?.contains("rotate-180")).toBe(false);
        fireEvent.click(button("Features"));
        expect(chevron()?.contains("rotate-180")).toBe(true);
        expect(button("Features").getAttribute("aria-expanded")).toBe("true");
        const items = screen.getAllByRole("menuitem");
        expect(items).toHaveLength(8);
        expect(document.activeElement).toBe(items[0]);
    });

    it("Esc in the Solutions menu closes it and focuses the Solutions button", () => {
        render(<SiteNav />);
        fireEvent.click(button("Solutions"));
        expect(screen.getAllByRole("menuitem")).toHaveLength(3);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(button("Solutions"));
        expect(button("Solutions").getAttribute("aria-expanded")).toBe("false");
    });

    it("a click outside the nav closes the open menu", () => {
        render(
            <>
                <SiteNav />
                <p>Elsewhere</p>
            </>,
        );
        fireEvent.click(button("Features"));
        expect(screen.getByRole("menu")).toBeTruthy();
        fireEvent.click(screen.getByText("Elsewhere"));
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("arrow keys move within the menu and wrap", () => {
        render(<SiteNav />);
        fireEvent.click(button("Solutions"));
        const [shops, gyms, clinics] = screen.getAllByRole("menuitem");
        fireEvent.keyDown(shops, { key: "ArrowDown" });
        expect(document.activeElement).toBe(gyms);
        fireEvent.keyDown(gyms, { key: "ArrowRight" });
        expect(document.activeElement).toBe(clinics);
        fireEvent.keyDown(clinics, { key: "ArrowDown" });
        expect(document.activeElement).toBe(shops);
        fireEvent.keyDown(shops, { key: "ArrowUp" });
        expect(document.activeElement).toBe(clinics);
    });

    it("the start button comes from the CTA builder (waitlist by default)", () => {
        render(<SiteNav />);
        const starts = screen.getAllByRole("link", {
            name: "Join the waitlist",
        });
        expect(starts.length).toBeGreaterThan(0);
        expect(starts[0].getAttribute("href")).toBe("/waitlist?src=nav");
        expect(desktop()).toBeTruthy();
    });
});

/** The Resources menu the server would pass on 17 Oct: Help, Integrations, Changelog. */
const RESOURCES = [
    { name: "Help", line: "Answers.", href: "/help" },
    { name: "Integrations", line: "Connect.", href: "/integrations" },
    { name: "Changelog", line: "What's new.", href: "/changelog" },
];

describe("SiteNav: Resources (plan U1)", () => {
    it("has no Resources menu while no Resources page is live", () => {
        render(<SiteNav />);
        expect(screen.queryAllByRole("button", { name: /^Resources/ })).toEqual(
            [],
        );
    });

    it("opens by keyboard on its first item; arrows move; Escape closes to its button", () => {
        render(<SiteNav resources={RESOURCES} />);
        const resources = button("Resources");
        resources.focus();
        // A <button>: Enter and Space click it.
        fireEvent.click(resources);
        expect(resources.getAttribute("aria-expanded")).toBe("true");
        const menu = screen.getByRole("menu", { name: "Resources" });
        const items = screen.getAllByRole("menuitem");
        expect(items.map((i) => i.getAttribute("href"))).toEqual([
            "/help",
            "/integrations",
            "/changelog",
        ]);
        expect(document.activeElement).toBe(items[0]);
        fireEvent.keyDown(items[0], { key: "ArrowDown" });
        expect(document.activeElement).toBe(items[1]);
        fireEvent.keyDown(items[1], { key: "ArrowUp" });
        fireEvent.keyDown(items[0], { key: "ArrowUp" });
        expect(document.activeElement).toBe(items[2]);
        expect(menu).toBeTruthy();

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(resources.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(resources);
    });

    it("on a changelog entry, underlines Resources", () => {
        pathname = "/changelog/saroh-is-open";
        render(<SiteNav resources={RESOURCES} />);
        expect(button("Resources").className).toContain("decoration-brand-500");
        expect(button("Features").className).not.toContain(
            "decoration-brand-500",
        );
    });

    it("on /changelog, the menu marks Changelog as the page", () => {
        pathname = "/changelog";
        render(<SiteNav resources={RESOURCES} />);
        fireEvent.click(button("Resources"));
        expect(
            screen
                .getByRole("menuitem", { name: /^Changelog/ })
                .getAttribute("aria-current"),
        ).toBe("page");
    });

    it("the phone sheet has Resources, open on a Resources page", () => {
        pathname = "/changelog";
        render(<SiteNav resources={RESOURCES} />);
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        const sheet = screen.getByRole("dialog", { name: "Menu" });
        const row = screen
            .getAllByRole("button", { name: /^Resources/ })
            .find((b) => sheet.contains(b));
        expect(row?.getAttribute("aria-expanded")).toBe("true");
        const links = Array.from(
            sheet.querySelectorAll("#nav-sheet-resources a"),
        ).map((a) => a.getAttribute("href"));
        expect(links).toEqual(["/help", "/integrations", "/changelog"]);
    });
});

describe("MobileMenu (below 760px)", () => {
    it("opens on a Solutions page with Solutions expanded and Features closed", () => {
        pathname = "/solutions/gyms";
        render(<SiteNav />);
        const menu = screen.getByRole("button", { name: "Menu" });
        fireEvent.click(menu);
        const sheet = screen.getByRole("dialog", { name: "Menu" });
        expect(sheet).toBeTruthy();
        const inSheet = (name: RegExp) =>
            screen
                .getAllByRole("button", { name })
                .find((b) => sheet.contains(b));
        expect(inSheet(/^Solutions/)?.getAttribute("aria-expanded")).toBe(
            "true",
        );
        expect(inSheet(/^Features/)?.getAttribute("aria-expanded")).toBe(
            "false",
        );
        // D-9: the open row's chevron points up, the closed one's down.
        const flipped = (name: RegExp) =>
            inSheet(name)
                ?.querySelector("[data-chevron]")
                ?.classList.contains("rotate-180");
        expect(flipped(/^Solutions/)).toBe(true);
        expect(flipped(/^Features/)).toBe(false);
        const gyms = Array.from(sheet.querySelectorAll("a")).find(
            (a) => a.getAttribute("href") === "/solutions/gyms",
        );
        expect(gyms?.getAttribute("aria-current")).toBe("page");
    });

    it("Esc closes the sheet and returns focus to Menu", () => {
        render(<SiteNav />);
        const menu = screen.getByRole("button", { name: "Menu" });
        menu.focus();
        fireEvent.click(menu);
        expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
        act(() => {
            fireEvent.keyDown(document, { key: "Escape" });
        });
        expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
        expect(document.activeElement).toBe(menu);
    });

    it("keeps Tab inside the open sheet", () => {
        render(<SiteNav />);
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        const sheet = screen.getByRole("dialog", { name: "Menu" });
        const focusable = Array.from(
            sheet.querySelectorAll<HTMLElement>("a[href], button"),
        );
        focusable[focusable.length - 1].focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(focusable[0]);
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    });
});
