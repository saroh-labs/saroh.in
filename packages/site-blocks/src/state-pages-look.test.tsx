import { LOOK_IDS } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { frontButton } from "./blocks/look-front";
import { ModulePageUnavailable } from "./module-page-unavailable";
import { SitePageState } from "./shop/page-state";
import { SitePageMessage } from "./site-page-message";

/**
 * Every state page wears the look and says only what is true (DEC-172,
 * plan U15, #1108): the 404's frame, a page taken off, a read that
 * failed. One filled button at most, and Classic drawn as before.
 */

const filled = (root: HTMLElement) =>
    Array.from(root.querySelectorAll("a, button")).filter((el) =>
        /\bbg-site-accent\b/.test(el.className),
    );

describe.each(LOOK_IDS)("state pages in %s", (look) => {
    it("SitePageMessage draws the look's frame, the mark hidden from readers", () => {
        const { container } = render(
            <SitePageMessage
                look={look}
                mark="404"
                eyebrow="Page not found"
                title="This page isn’t here"
                actions={
                    <>
                        <a href="/" className={frontButton(look, "fill")}>
                            Go to the home page
                        </a>
                        <a href="/book" className={frontButton(look, "link")}>
                            Book
                        </a>
                    </>
                }
            >
                It may have moved.
            </SitePageMessage>,
        );
        const main = screen.getByRole("main");
        expect(main.getAttribute("data-site-state-look")).toBe(look);
        expect(main.hasAttribute("data-site-page")).toBe(true);
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "This page isn’t here",
            }),
        ).toBeTruthy();
        const mark = within(main).getByText("404");
        expect(mark.getAttribute("aria-hidden")).toBe("true");
        expect(filled(container)).toHaveLength(1);
        // Drawn from the site's layer only: no Saroh brand.
        expect(container.innerHTML).not.toMatch(
            /\b(saffron|bg-primary|font-display)\b/,
        );
    });

    it("a page taken off says so with one way home, never a 404", () => {
        const { container } = render(
            <ModulePageUnavailable business="Prana Yoga" look={look} />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "This isn't available right now",
            }),
        ).toBeTruthy();
        expect(screen.getByText(/Prana Yoga isn't offering this/)).toBeTruthy();
        const home = screen.getByRole("link", { name: "Go to the home page" });
        expect(home.getAttribute("href")).toBe("/");
        expect(filled(container)).toEqual([home]);
    });

    it("a failed read is an alert with Try again, never an empty page", () => {
        render(
            <SitePageState
                look={look}
                title="We couldn't open the shop"
                failed
                retryHref="/shop"
                reach={{
                    phone: "+918040992210",
                    whatsapp: null,
                    email: null,
                }}
            >
                Something went wrong on our side.
            </SitePageState>,
        );
        const alert = screen.getByRole("alert");
        expect(alert.getAttribute("data-page-state")).toBe("failed");
        expect(
            within(alert)
                .getByRole("link", { name: "Try again" })
                .getAttribute("href"),
        ).toBe("/shop");
        expect(within(alert).getByRole("link", { name: /^Call/ })).toBeTruthy();
    });

    it("an empty page is not announced as a failure", () => {
        render(
            <SitePageState look={look} title="No products yet">
                Nothing on sale yet.
            </SitePageState>,
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            document
                .querySelector("[data-page-state]")
                ?.getAttribute("data-page-state"),
        ).toBe("empty");
    });
});

describe("Classic state pages are unchanged", () => {
    it("draw no look marks", () => {
        const { container } = render(
            <>
                <SitePageMessage eyebrow="Page not found" title="T">
                    S
                </SitePageMessage>
                <ModulePageUnavailable business="Rye" />
                <SitePageState title="T">S</SitePageState>
            </>,
        );
        expect(container.querySelector("[data-site-state-look]")).toBeNull();
        expect(container.textContent).not.toContain("404");
    });
});
