// @vitest-environment jsdom
/**
 * The site picker (DEC-171, plan U14, #1097; `IBSiteD` beside the page,
 * `IBSiteP` a sheet on a phone): each website an address keeping the tab
 * and period, the one shown marked, closing on a choice.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { insightsHref } from "@/lib/insights/period";

import type { SiteOption } from "./site-picker";
import { SitePicker } from "./site-picker";

const options: SiteOption[] = [
    {
        id: null,
        name: "All your sites",
        line: "Every website together",
        href: insightsHref({ tab: "from", period: "3m", siteId: null }),
    },
    {
        id: "rye",
        name: "Rye & Co.",
        line: "rye.saroh.app",
        href: insightsHref({ tab: "from", period: "3m", siteId: "rye" }),
    },
    {
        id: "cafe",
        name: "Rye Café",
        line: "ryecafe.in",
        href: insightsHref({ tab: "from", period: "3m", siteId: "cafe" }),
    },
];

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
function trigger(): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>(
        '[data-testid="site-picker"]',
    );
    if (!el) throw new Error("no site picker");
    return el;
}
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
function openSheet(): HTMLElement {
    const el = sheet();
    if (!el) throw new Error("the sheet isn't open");
    return el;
}

describe("the site picker", () => {
    it("names the website shown, closed until asked", () => {
        act(() => root.render(<SitePicker value="cafe" options={options} />));
        expect(trigger().textContent).toBe("Rye Café");
        expect(trigger().getAttribute("aria-label")).toBe("Website: Rye Café");
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(sheet()).toBeNull();
    });

    it("reads all of them when nothing is chosen", () => {
        act(() => root.render(<SitePicker value={null} options={options} />));
        expect(trigger().textContent).toBe("All your sites");
    });

    it("opens on every website, each keeping the tab and the period", async () => {
        act(() => root.render(<SitePicker value="rye" options={options} />));
        await act(async () => {
            trigger().click();
            await settle();
        });
        const dialog = openSheet();
        expect(dialog.textContent).toContain("Which website");
        const links = Array.from(
            dialog.querySelectorAll<HTMLAnchorElement>(
                '[data-testid="site-options"] a',
            ),
        );
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/analytics?tab=from&period=3m",
            "/analytics?tab=from&period=3m&siteId=rye",
            "/analytics?tab=from&period=3m&siteId=cafe",
        ]);
        expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([
            null,
            "true",
            null,
        ]);
        // Each choice says where it is, under its name.
        expect(links[1]?.textContent).toBe("Rye & Co.rye.saroh.app");
    });

    it("closes on a choice", async () => {
        act(() => root.render(<SitePicker value={null} options={options} />));
        await act(async () => {
            trigger().click();
            await settle();
        });
        const link = openSheet().querySelector<HTMLAnchorElement>(
            '[data-testid="site-options"] a[href$="siteId=cafe"]',
        );
        if (!link) throw new Error("no Rye Café");
        await act(async () => {
            link.addEventListener("click", (e) => e.preventDefault(), {
                once: true,
            });
            link.click();
            await settle();
        });
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });
});
