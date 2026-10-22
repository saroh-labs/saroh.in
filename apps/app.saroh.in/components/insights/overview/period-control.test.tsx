// @vitest-environment jsdom
/**
 * Insights' one period (DEC-171, plan U10, #1089): on the desk the three
 * side by side, each an address; on a phone one button naming the period,
 * opening a sheet (`IBPeriodP`) that says each period's days, marks the one
 * shown, and closes by Close, Escape or choosing.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { InsightsPeriod } from "@/lib/insights/period";
import {
    INSIGHTS_PERIODS,
    insightsHref,
    periodChoiceLine,
    periodWindow,
} from "@/lib/insights/period";

import type { PeriodChoice } from "./period-control";
import { PeriodSegments, PeriodSheet } from "./period-control";

const TODAY = "2026-10-19";
const choices = (tab: "overview" | "money" = "overview"): PeriodChoice[] =>
    INSIGHTS_PERIODS.map((period: InsightsPeriod) => ({
        period,
        href: insightsHref({ tab, period, siteId: null }),
        line: periodChoiceLine(period, periodWindow(period, TODAY)),
    }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("the desk's three", () => {
    it("are links that keep the tab, the one shown marked", () => {
        act(() =>
            root.render(
                <PeriodSegments value="7d" choices={choices("money")} />,
            ),
        );
        const links = Array.from(host.querySelectorAll<HTMLAnchorElement>("a"));
        expect(links.map((a) => a.textContent)).toEqual([
            "Last 7 days",
            "Last 4 weeks",
            "Last 3 months",
        ]);
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/analytics?tab=money&period=7d",
            "/analytics?tab=money",
            "/analytics?tab=money&period=3m",
        ]);
        expect(links[0]?.getAttribute("aria-current")).toBe("page");
        expect(links[1]?.getAttribute("aria-current")).toBeNull();
    });
});

describe("the phone's sheet", () => {
    it("opens from the button naming the period, each choice saying its days", async () => {
        act(() => root.render(<PeriodSheet value="4w" choices={choices()} />));
        const button = host.querySelector("button");
        expect(button?.textContent).toBe("Last 4 weeks");
        expect(button?.getAttribute("aria-label")).toBe(
            "Show figures for: Last 4 weeks",
        );
        await act(async () => {
            button?.click();
            await settle();
        });
        const sheet = document.querySelector('[role="dialog"]');
        expect(sheet).not.toBeNull();
        expect(sheet?.textContent).toContain("Show figures for");
        expect(sheet?.textContent).toContain(
            "13 to 19 Oct, against 6 to 12 Oct",
        );
        expect(sheet?.textContent).toContain(
            "22 Sep to 19 Oct, against the 4 weeks before",
        );
        expect(sheet?.textContent).toContain(
            "Every figure on Insights follows this choice.",
        );
        const options = Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
                '[role="dialog"] li a',
            ),
        );
        expect(options).toHaveLength(3);
        expect(options[1]?.getAttribute("aria-current")).toBe("true");
        expect(options[0]?.getAttribute("href")).toBe("/analytics?period=7d");
        // Focus starts on Close, so nothing is chosen by accident.
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
            "Close",
        );
    });

    it("closes on choosing, and on Escape", async () => {
        act(() => root.render(<PeriodSheet value="4w" choices={choices()} />));
        const button = host.querySelector("button");
        await act(async () => {
            button?.click();
            await settle();
        });
        const first = document.querySelector<HTMLAnchorElement>(
            '[role="dialog"] li a',
        );
        await act(async () => {
            // A real click would navigate; the sheet closes either way.
            first?.addEventListener("click", (e) => e.preventDefault(), {
                once: true,
            });
            first?.click();
            await settle();
        });
        expect(document.querySelector('[role="dialog"]')).toBeNull();

        await act(async () => {
            button?.click();
            await settle();
        });
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        await act(async () => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await settle();
        });
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(button);
    });
});
