import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter, madeWithSarohHref } from "./site-chrome";
import type { SiteSeller } from "./sold-by";
import {
    SoldByLine,
    reportBusinessHref,
    sellerLead,
    soldByLine,
} from "./sold-by";

/**
 * Who a customer is buying from (DEC-121, amended 10 Oct): the business's
 * own details, never a sentence of Saroh's; and "Report" only beside the
 * Free credit, so a paid site carries no Saroh link. Made-up businesses.
 */

const REPORT = reportBusinessHref("rye.saroh.app");
const SELLER: SiteSeller = {
    lead: "Sold by",
    name: "Rye Foods LLP",
    address: "12 Hill Road, Bengaluru 560001, Karnataka",
    email: "hello@rye.example.com",
    phone: "+919845012345",
};
const NO_SAROH_TOKENS =
    /\bfont-(sans|display|mono)\b|\b(bg|text|border|ring)-(primary|secondary|brand|foreground|background|muted|accent|card|border|ring)\b(?!-)/;

describe("the words", () => {
    it("says Sold by for a shop and Run by for a site without one", () => {
        expect(sellerLead(true)).toBe("Sold by");
        expect(sellerLead(false)).toBe("Run by");
        expect(soldByLine(SELLER)).toBe("Sold by Rye Foods LLP");
        expect(soldByLine({ lead: "Run by", name: " Kavi Dental " })).toBe(
            "Run by Kavi Dental",
        );
        expect(soldByLine({ lead: "Sold by", name: "  " })).toBeNull();
    });

    it("reports to saroh.in/customers with the site's address filled in", () => {
        expect(REPORT).toBe("https://saroh.in/customers?site=rye.saroh.app");
        expect(reportBusinessHref(" Shop.Example.com ")).toBe(
            "https://saroh.in/customers?site=shop.example.com",
        );
        expect(reportBusinessHref("")).toBe("https://saroh.in/customers");
    });

    it("draws one quiet line on a confirmation, and nothing without one", () => {
        const { container, rerender } = render(
            <SoldByLine
                line="Sold by Rye Foods LLP"
                className="text-site-muted"
            />,
        );
        expect(screen.getByText("Sold by Rye Foods LLP")).toHaveClass(
            "text-site-muted",
        );
        expect(screen.queryByRole("link")).toBeNull();
        rerender(<SoldByLine line={null} />);
        expect(container.innerHTML).toBe("");
    });
});

describe("the footer's Sold by block", () => {
    it("names the business and its registered address on a paid site, with no Saroh link", () => {
        const { container } = render(
            <SiteFooter
                footer={{ format: "markdown", value: "Open daily" }}
                name="Rye & Co."
                contact={{
                    phone: SELLER.phone ?? null,
                    email: SELLER.email ?? null,
                    address: null,
                }}
                seller={SELLER}
            />,
        );
        const block = container.querySelector("[data-sold-by]");
        expect(
            Array.from(block?.querySelectorAll("p") ?? []).map(
                (p) => p.textContent,
            ),
        ).toEqual([
            "Sold by Rye Foods LLP",
            "12 Hill Road, Bengaluru 560001, Karnataka",
        ]);
        const footer = screen.getByRole("contentinfo");
        expect(footer.textContent).not.toMatch(/Saroh|Report|responsible/);
        expect(footer.innerHTML).not.toContain("saroh.in");
        // The contact row shows the email and phone once, not twice.
        expect(screen.getAllByRole("link")).toHaveLength(2);
        expect(container.innerHTML).not.toMatch(NO_SAROH_TOKENS);
    });

    it("puts the contact in the block in the left layout, which has no contact row", () => {
        const { container } = render(
            <SiteFooter
                footer={{
                    format: "markdown",
                    value: "Open daily",
                    layout: "left",
                }}
                name="Rye & Co."
                seller={SELLER}
            />,
        );
        const lines = Array.from(
            container.querySelectorAll("[data-sold-by] p"),
        ).map((p) => p.textContent);
        expect(lines).toEqual([
            "Sold by Rye Foods LLP",
            "12 Hill Road, Bengaluru 560001, Karnataka",
            "hello@rye.example.com · +91 98450 12345",
        ]);
        expect(
            screen.getByRole("link", { name: "hello@rye.example.com" }),
        ).toHaveAttribute("href", "mailto:hello@rye.example.com");
    });

    it("says just the name when nothing else is set", () => {
        const { container } = render(
            <SiteFooter
                footer={null}
                name="Kavi Dental"
                seller={{ lead: "Run by", name: "Kavi Dental" }}
            />,
        );
        expect(container.querySelector("[data-sold-by]")?.textContent).toBe(
            "Run by Kavi Dental",
        );
    });

    it("draws nothing without it (the editor's canvas)", () => {
        const { container } = render(
            <SiteFooter
                footer={{ format: "markdown", value: "Open daily" }}
                name="Rye & Co."
            />,
        );
        expect(container.querySelector("[data-sold-by]")).toBeNull();
    });
});

describe("Report, on Free only", () => {
    const FREE = { href: madeWithSarohHref("k7m2p9qa"), reportHref: REPORT };

    it("sits beside Made with Saroh, to saroh.in/customers", () => {
        render(
            <SiteFooter
                footer={{ format: "markdown", value: "Open daily" }}
                name="Rye & Co."
                credit={FREE}
                seller={SELLER}
            />,
        );
        const report = screen.getByRole("link", {
            name: "Report this business to Saroh",
        });
        expect(report).toHaveAttribute("href", REPORT);
        expect(report).toHaveAttribute("target", "_blank");
        expect(report.closest("p")?.textContent).toBe(
            "Open daily · Made with Saroh · Report",
        );
    });

    it("sits after the credit in the left layout too", () => {
        render(
            <SiteFooter
                footer={{
                    format: "markdown",
                    value: "Open daily",
                    layout: "left",
                }}
                name="Rye & Co."
                credit={FREE}
            />,
        );
        expect(
            screen.getByRole("link", {
                name: "Report this business to Saroh",
            }),
        ).toHaveAttribute("href", REPORT);
    });

    it("is not drawn where the credit is hidden", () => {
        render(
            <SiteFooter
                footer={{ format: "markdown", value: "Open daily" }}
                name="Rye & Co."
                credit={null}
                seller={SELLER}
            />,
        );
        expect(
            screen.queryByRole("link", {
                name: "Report this business to Saroh",
            }),
        ).toBeNull();
    });
});
