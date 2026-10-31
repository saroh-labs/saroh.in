// The content pages' shared blocks (plan 2026-10-31-002 U4): what each draws, desk and phone, and that links come only from props.
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Figure, pickRelated, Related } from "./components/content-blocks";
import { DataTable } from "./components/data-table";
import { Crumbs } from "./components/page-parts";
import {
    COMPOSITION,
    GstShowcase,
    GuideShowcase,
    HubShowcase,
    IGST_INVOICE,
    SALON_INVOICE,
} from "./content-blocks.fixture";
import { unknownClasses } from "./test-classes";

afterEach(cleanup);
const css = readFileSync(join(__dirname, "styles.css"), "utf8");

describe("DataTable", () => {
    it("invoice: two lines with CGST and SGST, and the total row", () => {
        const { container } = render(<DataTable {...SALON_INVOICE} />);
        const desk = container.querySelector(".sp-dt-desk table");
        if (!desk) throw new Error("no desk table");
        const heads = [...desk.querySelectorAll("thead th")];
        expect(heads.map((h) => h.getAttribute("scope"))).toEqual(
            Array(6).fill("col"),
        );
        expect(desk.querySelectorAll("tbody th[scope=row]")).toHaveLength(3);
        const total = desk.querySelector(".sp-dt-total");
        expect(total?.textContent).toBe("Total₹2,300.00₹57.50₹57.50₹2,415.00");
        // The phone: the same lines, then the money as dt/dd pairs.
        const phone = container.querySelector(".sp-dt-phone");
        if (!phone) throw new Error("no phone layout");
        expect(phone.querySelectorAll("li")).toHaveLength(2);
        expect(phone.querySelector("li")?.textContent).toBe(
            "Haircut & blow-dry (women)SAC 999721 · GST 5%₹800.00",
        );
        const pairs = [...phone.querySelectorAll("dl > div")].map((d) => [
            d.querySelector("dt")?.textContent,
            d.querySelector("dd")?.textContent,
        ]);
        expect(pairs).toEqual([
            ["Taxable value", "₹2,300.00"],
            ["CGST 2.5%", "₹57.50"],
            ["SGST 2.5%", "₹57.50"],
            ["Total", "₹2,415.00"],
        ]);
    });

    it("invoice to another state: one tax column", () => {
        const { container } = render(<DataTable {...IGST_INVOICE} />);
        const heads = [
            ...container.querySelectorAll(".sp-dt-desk thead th"),
        ].map((h) => h.textContent);
        expect(heads.filter((h) => h.includes("GST"))).toEqual(["IGST 18%"]);
        expect(
            [...container.querySelectorAll(".sp-dt-phone dt")].map(
                (d) => d.textContent,
            ),
        ).toEqual(["Taxable value", "IGST 18%", "Total"]);
    });

    it("compare: yes/no reads Yes/No on a desk and ✓/— on a phone, the text row moves to the note", () => {
        const { container } = render(<DataTable {...COMPOSITION} />);
        expect(
            container.querySelector(".sp-dt-desk tbody td")?.textContent,
        ).toBe("No");
        const check = container.querySelector(".sp-dt-check");
        if (!check) throw new Error("no check table");
        expect(check.querySelectorAll("tbody tr")).toHaveLength(3);
        expect(
            within(check as HTMLElement).getAllByRole("img", { name: "Yes" }),
        ).toHaveLength(3);
        expect(check.querySelectorAll("td.sp-dt-tint")).toHaveLength(3);
        expect(container.querySelector(".sp-dt-pnote")?.textContent).toMatch(
            /^Bill you give/,
        );
    });
});

describe("Related", () => {
    const items = [
        { name: "A", search: "gst on salon services", href: "/gst/a" },
        { name: "B", search: "gst on gym membership", href: "/gst/b" },
    ];

    it("drops a page that targets the same search, and draws what exists when fewer than 3", () => {
        expect(
            pickRelated(items, "GST on salon services ").map((i) => i.name),
        ).toEqual(["B"]);
        render(
            <Related
                variant="cards"
                title="More guides"
                items={items}
                current={{ search: "gst on salon services" }}
            />,
        );
        expect(
            screen.getAllByRole("link").map((a) => a.getAttribute("href")),
        ).toEqual(["/gst/b"]);
    });

    it("never more than 3", () => {
        const many = ["A", "B", "C", "D"].map((name) => ({ name }));
        const { container } = render(
            <Related variant="rail" title="More GST guides" items={many} />,
        );
        expect(container.querySelectorAll("a")).toHaveLength(3);
    });
});

describe("Crumbs", () => {
    it("on a phone, a trail of 4 shows the first, … and the last", () => {
        const { container } = render(
            <Crumbs
                crumbs={[
                    { name: "Guides", href: "/guides" },
                    { name: "Bookings", href: "/guides?for=x" },
                    { name: "Cut no-shows" },
                ]}
                home={{ href: "/" }}
                sep="›"
                collapse
            />,
        );
        const items = [...container.querySelectorAll(".sp-crumb-i")];
        const phone = items
            .filter((i) => !i.classList.contains("sp-d"))
            .map((i) => i.textContent);
        expect(phone).toEqual(["Home", "›…", "›Cut no-shows"]);
        const desk = items
            .filter((i) => !i.classList.contains("sp-p"))
            .map((i) => i.textContent);
        expect(desk).toEqual(["Home", "›Guides", "›Bookings", "›Cut no-shows"]);
        // Every crumb link is at least 44px tall on a phone.
        expect(css).toMatch(
            /\.sp-crumb a \{\s*display: inline-flex;\s*align-items: center;\s*min-height: 44px;/,
        );
    });

    it("draws a 3-crumb trail whole", () => {
        const { container } = render(
            <Crumbs
                crumbs={[{ name: "Guides" }, { name: "X" }]}
                home={{}}
                sep="›"
                collapse
            />,
        );
        expect(container.querySelectorAll(".sp-d, .sp-p")).toHaveLength(0);
    });
});

describe("Figure", () => {
    it("needs words for its picture", () => {
        render(<Figure src="/a.png" alt="A reminder on a phone" />);
        expect(
            screen.getByRole("img", { name: "A reminder on a phone" }),
        ).toBeTruthy();
        expect(() => render(<Figure src="/a.png" alt=" " />)).toThrow(/no alt/);
    });
});

describe.each([
    ["GST page", GstShowcase],
    ["guide", GuideShowcase],
    ["hub", HubShowcase],
])("the %s", (_, Page) => {
    it("draws only classes styles.css knows", () => {
        const { container } = render(<Page />);
        expect(unknownClasses(container)).toEqual([]);
    });

    it("links nowhere when no hrefs are passed (the admin preview), but its own outline", () => {
        const { container } = render(<Page />);
        const out = [...container.querySelectorAll("a[href]")].map((a) =>
            a.getAttribute("href"),
        );
        expect(out.filter((h) => !h?.startsWith("#"))).toEqual([]);
    });

    it("has one heading order with no skipped level", () => {
        const { container } = render(<Page />);
        const levels = [...container.querySelectorAll("h1,h2,h3")].map((h) =>
            Number(h.tagName[1]),
        );
        levels.forEach(
            (l, i) =>
                i > 0 &&
                expect(l - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1),
        );
    });
});

it("the guide's outline links match its H2 ids", () => {
    const { container } = render(<GuideShowcase />);
    const outline = [...container.querySelectorAll(".sp-otp a")].map((a) =>
        a.getAttribute("href"),
    );
    const ids = [...container.querySelectorAll("h2[id]")].map(
        (h) => `#${h.id}`,
    );
    expect(outline).toEqual(ids);
    expect(outline.length).toBe(2);
});
