// @vitest-environment jsdom
/**
 * "When is it busiest?" (DEC-171, plan U13, #1095): the grid, and Show as
 * a table with the same numbers, a row per day; Show as a grid brings the
 * grid back. Too young or too few draws nothing to toggle.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import { sellsEmpty, sellsRead } from "@/lib/insights/sells.fixture";

import { BusiestGrid } from "./busiest-grid";

const s = stage();

beforeEach(() => s.mount());
afterEach(() => s.unmount());

const grid = () => document.querySelector('[data-testid="busy-grid"]');
const table = () =>
    document.querySelector<HTMLTableElement>('[data-testid="busy-table"]');

describe("BusiestGrid", () => {
    it("shows the grid, then the same numbers as a table, then the grid again", () => {
        s.render(<BusiestGrid read={sellsRead()} />);
        expect(grid()).not.toBeNull();
        expect(table()).toBeNull();
        expect(s.button("Show as a table")?.getAttribute("aria-expanded")).toBe(
            "false",
        );

        s.press("Show as a table");
        expect(grid()).toBeNull();
        const t = table();
        if (!t) throw new Error("Show as a table draws the table");
        const heads = Array.from(t.querySelectorAll("thead th")).map((th) =>
            th.textContent.trim(),
        );
        expect(heads).toEqual([
            "Day",
            "7 to 10",
            "10 to 1",
            "1 to 4",
            "4 to 8",
        ]);
        const rows = Array.from(t.querySelectorAll("tbody tr"));
        expect(rows).toHaveLength(7);
        // Saturday: 120 before 10, 80 till 1, 30 till 4, 20 till 8.
        const saturday = Array.from(rows[5].querySelectorAll("td")).map((td) =>
            td.textContent.trim(),
        );
        expect(rows[5].querySelector("th")?.textContent).toContain("Saturday");
        expect(saturday).toEqual(["120", "80", "30", "20"]);
        // The legend's shades go with the grid.
        expect(s.text()).not.toContain("Quieter");
        const back = s.button("Show as a grid");
        expect(back?.getAttribute("aria-expanded")).toBe("true");

        s.press("Show as a grid");
        expect(grid()).not.toBeNull();
        expect(table()).toBeNull();
        expect(s.text()).toContain("Quieter");
    });

    it("says what it needs, with nothing to show, before there is enough", () => {
        s.render(<BusiestGrid read={sellsEmpty()} />);
        expect(grid()).toBeNull();
        expect(s.button("Show as a table")).toBeUndefined();
        expect(s.text()).toContain("to say when it's busiest.");
    });
});
