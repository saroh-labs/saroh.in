// @vitest-environment jsdom
/**
 * "From visit to paid" (plan U16, #1101; `IBFromD`, `IBFromP`): four
 * steps in plain words, never going up, each a share of the one before
 * said as a count reads ("1 in 3 of them"), never a percentage.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { VisitPathRead } from "@/lib/insights/reads";

import { VisitPath } from "./visit-path";

function render(path: VisitPathRead) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
        <VisitPath path={path} period="4w" />,
    );
    return host;
}

const steps = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>("li[data-step]")).map(
        (li) => ({
            step: li.getAttribute("data-step"),
            text: li.textContent,
            width: li.querySelector<HTMLElement>("[style]")?.style.width,
        }),
    );

describe("From visit to paid", () => {
    it("draws four steps, each with its count and its share of the one before", () => {
        const host = render({
            visits: 1109,
            looked: 612,
            started: 214,
            paid: 159,
        });
        expect(host.querySelector("h3")?.textContent).toBe(
            "From visit to paid",
        );
        expect(host.textContent).toContain(
            "1 in 7 visits ended in a payment. Most who start an order or booking finish it. The biggest drop is between looking and starting.",
        );
        expect(steps(host)).toEqual([
            {
                step: "visits",
                text: "Visited your site1,109 visits",
                width: "100%",
            },
            {
                step: "looked",
                text: "Looked at a product or classAbout half of them612",
                width: "55%",
            },
            {
                step: "started",
                text: "Started an order or booking1 in 3 of them214",
                width: "19%",
            },
            { step: "paid", text: "Paid3 in 4 of them159", width: "14%" },
        ]);
        expect(host.textContent).not.toMatch(/%/);
    });

    it("never draws a step above the one before", () => {
        const host = render({ visits: 40, looked: 40, started: 12, paid: 12 });
        const widths = steps(host).map((s) => Number.parseInt(s.width ?? ""));
        for (let i = 1; i < widths.length; i++) {
            expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
        }
        expect(host.textContent).toContain("All of them");
    });

    it("says no visit plainly, every bar empty", () => {
        const host = render({ visits: 0, looked: 0, started: 0, paid: 0 });
        expect(host.textContent).toContain(
            "No visits counted in the last 4 weeks.",
        );
        expect(steps(host).every((s) => s.width === "0%")).toBe(true);
    });

    it("hides the business's figures from a recording, not its words", () => {
        const host = render({ visits: 10, looked: 5, started: 2, paid: 1 });
        expect(host.querySelector("h3")?.hasAttribute("data-ph-unmask")).toBe(
            true,
        );
        expect(host.querySelector("ol")?.hasAttribute("data-ph-mask")).toBe(
            true,
        );
    });
});
