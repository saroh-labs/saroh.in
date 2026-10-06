// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PRIVACY } from "@/content/privacy";
import { parseLegal } from "@/lib/legal-markdown";

import { LegalText } from "./legal-text";

const table = parseLegal(`| What | Examples | Why |
| --- | --- | --- |
| Account | Name, email, phone | To sign you in |
| Messages | What you write to hello@saroh.in | To help you |`);

describe("LegalText tables (audit T1)", () => {
    it("draws each row as a card below sm: a bold heading, then labelled values", () => {
        const { container } = render(<LegalText blocks={table} />);
        const list = container.querySelector("ul[data-legal-cards]");
        expect(list?.className).toContain("sm:hidden");
        const cards = list?.querySelectorAll(":scope > li") ?? [];
        expect(cards).toHaveLength(2);

        const first = cards[0];
        expect(first.querySelector("p")?.textContent).toBe("Account");
        expect(first.querySelector("p")?.className).toContain("font-semibold");
        const pairs = Array.from(first.querySelectorAll("dl > div")).map(
            (d) => [
                d.querySelector("dt")?.textContent,
                d.querySelector("dd")?.textContent,
            ],
        );
        expect(pairs).toEqual([
            ["Examples", "Name, email, phone"],
            ["Why", "To sign you in"],
        ]);
        // The email in a card is still a link.
        expect(cards[1].querySelector("a")?.getAttribute("href")).toBe(
            "mailto:hello@saroh.in",
        );
    });

    it("keeps a semantic table from sm up, with column and row headers", () => {
        const { container } = render(<LegalText blocks={table} />);
        const tableEl = container.querySelector("table");
        expect(tableEl?.parentElement?.className).toContain("hidden");
        expect(tableEl?.parentElement?.className).toContain("sm:block");
        const cols = Array.from(container.querySelectorAll('th[scope="col"]'));
        expect(cols.map((th) => th.textContent)).toEqual([
            "What",
            "Examples",
            "Why",
        ]);
        const rows = Array.from(container.querySelectorAll('th[scope="row"]'));
        expect(rows.map((th) => th.textContent)).toEqual([
            "Account",
            "Messages",
        ]);
        expect(container.querySelectorAll("tbody td")).toHaveLength(4);
    });

    it("wraps whole words: no overflow-wrap:anywhere, no clipping wrapper", () => {
        const { container } = render(
            <LegalText blocks={parseLegal(PRIVACY.body)} />,
        );
        expect(container.querySelectorAll("table")).toHaveLength(3);
        expect(container.querySelectorAll("ul[data-legal-cards]")).toHaveLength(
            3,
        );
        const html = container.innerHTML;
        expect(html).not.toContain("overflow-wrap:anywhere");
        expect(html).not.toContain("overflow-hidden");
        expect(container.querySelector("table")?.className).toContain(
            "break-words",
        );
        expect(container.querySelector("table")?.className).toContain(
            "hyphens-auto",
        );
    });
});
