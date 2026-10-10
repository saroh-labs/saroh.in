// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MADE_BY } from "@/content/resources";

import { SiteFooter } from "./site-footer";

/** The footer (plan U1, R6): Resources, who makes Saroh, published legal pages only. */
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
afterEach(cleanup);

describe("SiteFooter", () => {
    it("writes to contact@saroh.in (DEC-101)", () => {
        render(<SiteFooter />);
        expect(
            screen.getByRole("link", { name: "Contact" }).getAttribute("href"),
        ).toBe("mailto:contact@saroh.in");
    });

    it("links customers of a business to /customers, always (DEC-121)", () => {
        render(<SiteFooter />);
        expect(
            screen
                .getByRole("link", { name: "Bought from a business on Saroh?" })
                .getAttribute("href"),
        ).toBe("/customers");
    });

    it("says who makes Saroh, and has no Resources column, Privacy or Terms before they're live", () => {
        render(<SiteFooter />);
        expect(screen.getByText(MADE_BY)).toBeTruthy();
        expect(screen.queryByText("Resources")).toBeNull();
        expect(screen.queryByRole("link", { name: "Privacy" })).toBeNull();
        expect(screen.queryByRole("link", { name: /Terms/ })).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Cookie choices" }),
        ).toBeNull();
    });

    it("lists the Resources it is given, Privacy once published, and Cookie choices where GA runs", () => {
        render(
            <SiteFooter
                resources={[
                    { name: "Changelog", line: "", href: "/changelog" },
                ]}
                legal={[{ name: "Privacy", href: "/privacy" }]}
                cookieChoices
            />,
        );
        const changelog = screen.getByRole("link", { name: "Changelog" });
        expect(changelog.getAttribute("href")).toBe("/changelog");
        expect(changelog.parentElement?.firstElementChild?.textContent).toBe(
            "Resources",
        );
        expect(
            screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
        ).toBe("/privacy");
        expect(
            screen.getByRole("button", { name: "Cookie choices" }),
        ).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Terms/ })).toBeNull();
    });
});
