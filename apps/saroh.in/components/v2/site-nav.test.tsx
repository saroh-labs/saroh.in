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

    it("on /pricing, marks Pricing as the page", () => {
        pathname = "/pricing";
        render(<SiteNav />);
        const pricing = screen.getAllByRole("link", { name: "Pricing" })[0];
        expect(pricing.getAttribute("aria-current")).toBe("page");
    });

    it("Features opens a menu of eight, focused on the first", () => {
        render(<SiteNav />);
        fireEvent.click(button("Features"));
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
