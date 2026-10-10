import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    BusinessResponsibility,
    reportBusinessHref,
    responsibilityLine,
} from "./business-responsibility";
import { SiteFooter } from "./site-chrome";

/**
 * Who runs a merchant's site (Terms rev 46, 9 Oct): the business, in one
 * quiet line in the site's own tokens, with "Report this business" in the
 * footer. Made-up businesses only.
 */

const REPORT = reportBusinessHref("rye.saroh.app");
const LINE =
    "Rye & Co. runs this website and is responsible for its orders and bookings.";

describe("the words", () => {
    it("names the business", () => {
        expect(responsibilityLine("Rye & Co.")).toBe(LINE);
        expect(responsibilityLine("  ")).toBe(
            "This business runs this website and is responsible for its orders and bookings.",
        );
    });

    it("reports to saroh.in/customers with the site's address filled in", () => {
        expect(REPORT).toBe("https://saroh.in/customers?site=rye.saroh.app");
        expect(reportBusinessHref(" Shop.Example.com ")).toBe(
            "https://saroh.in/customers?site=shop.example.com",
        );
        expect(reportBusinessHref("")).toBe("https://saroh.in/customers");
    });

    it("draws the line alone on a confirmation, no link", () => {
        render(
            <BusinessResponsibility
                businessName="Rye & Co."
                className="text-site-muted"
            />,
        );
        expect(screen.getByText(LINE)).toHaveClass("text-site-muted");
        expect(screen.queryByRole("link")).toBeNull();
    });
});

describe("the site footer's line", () => {
    it("says who runs the site, with the report link, on a paid plan too", () => {
        const { container } = render(
            <SiteFooter
                footer={{ format: "markdown", value: "Open daily" }}
                name="Rye & Co."
                responsibility={{ reportHref: REPORT }}
            />,
        );
        const link = screen.getByRole("link", {
            name: "Report this business",
        });
        expect(link).toHaveAttribute("href", REPORT);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.closest("p")?.textContent).toBe(
            `${LINE} Report this business`,
        );
        // The merchant's tokens, never Saroh's.
        expect(container.innerHTML).not.toMatch(
            /\bfont-(sans|display|mono)\b|\b(bg|text|border|ring)-(primary|secondary|brand|foreground|background|muted|accent|card|border|ring)\b(?!-)/,
        );
    });

    it("sits under the row in the left layout", () => {
        render(
            <SiteFooter
                footer={{
                    format: "markdown",
                    value: "Open daily",
                    layout: "left",
                }}
                name="Rye & Co."
                responsibility={{ reportHref: REPORT }}
            />,
        );
        expect(
            screen.getByRole("link", { name: "Report this business" }),
        ).toBeTruthy();
        expect(screen.getByRole("contentinfo").textContent).toContain(LINE);
    });

    it("draws nothing without it (the editor's canvas)", () => {
        render(
            <SiteFooter
                footer={{ format: "markdown", value: "Open daily" }}
                name="Rye & Co."
            />,
        );
        expect(screen.getByRole("contentinfo").textContent).not.toContain(
            "responsible",
        );
    });
});
