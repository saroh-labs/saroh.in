// @vitest-environment jsdom
/**
 * Where customers come from, now (DEC-171, plan U14, #1097; `IBFromD`,
 * `IBSiteD`, `IBFailedD`): Coming next, the site picker only with more
 * than one website, the figures for the period, and each read that fails
 * named.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

import type { AnalyticsSummary, AnalyticsView } from "@/lib/analytics/summary";
import { summarizeAnalytics } from "@/lib/analytics/summary";
import type { SourceRead } from "@/lib/analytics/takings";
import { insightsHref, periodWindow } from "@/lib/insights/period";

import { FromTab } from "./from-tab";
import type { SiteOption } from "./site-picker";

const WINDOW = periodWindow("4w", "2026-10-19");

const view: AnalyticsView = summarizeAnalytics(
    [
        {
            siteId: "",
            date: "2026-10-08T00:00:00.000Z",
            type: "site.view",
            dimension: "",
            dimensionValue: "",
            count: 40,
            uniqueCount: 31,
        },
    ],
    { from: WINDOW.from, to: WINDOW.to },
);
const earlier: AnalyticsSummary = {
    siteViews: 30,
    uniqueVisitors: 31,
    enquiries: 0,
    orders: 0,
};

const OK_VIEW: SourceRead<AnalyticsView> = { status: "ok", data: view };
const OK_BEFORE: SourceRead<AnalyticsSummary> = { status: "ok", data: earlier };

const site = (id: string | null, name: string): SiteOption => ({
    id,
    name,
    line: id ? `${id}.saroh.app` : "Every website together",
    href: insightsHref({ tab: "from", siteId: id }),
});
const ALL = site(null, "All your sites");

function render({
    current = OK_VIEW,
    before = OK_BEFORE,
    sites = [ALL, site("rye", "Rye & Co.")],
    sitesFailed = false,
    siteId = null,
}: {
    current?: SourceRead<AnalyticsView>;
    before?: SourceRead<AnalyticsSummary>;
    sites?: SiteOption[] | null;
    sitesFailed?: boolean;
    siteId?: string | null;
} = {}) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
        <FromTab
            period="4w"
            window={WINDOW}
            current={current}
            before={before}
            sites={sites}
            sitesFailed={sitesFailed}
            siteId={siteId}
            retryHref={insightsHref({ tab: "from", siteId })}
        />,
    );
    return host;
}

describe("Where customers come from, now", () => {
    it("says what comes next and what works today (A9)", () => {
        const next = render().querySelector('[data-testid="from-next"]');
        expect(next?.textContent).toContain("Coming next.");
        expect(next?.textContent).toContain(
            "Sources and the path from visit to paid need your site's links to be tracked.",
        );
    });

    it("shows the period's figures with how they moved", () => {
        const host = render();
        expect(host.textContent).toContain(
            "Last 4 weeks: visits, people, enquiries, and paid orders and bookings. Updated every hour.",
        );
        expect(host.textContent).toContain("10 more than the 4 weeks before");
        // Every day of the four weeks is drawn.
        expect(
            host.querySelectorAll('[data-testid="website-visits"] button'),
        ).toHaveLength(28);
        expect(host.textContent).toContain("How these are counted");
    });

    it("offers no picker with one website", () => {
        expect(
            render().querySelector('[data-testid="site-picker"]'),
        ).toBeNull();
        expect(
            render({ sites: null }).querySelector(
                '[data-testid="site-picker"]',
            ),
        ).toBeNull();
    });

    it("offers the picker with more than one, naming the one chosen", () => {
        const sites = [ALL, site("rye", "Rye & Co."), site("cafe", "Rye Café")];
        const all = render({ sites });
        expect(
            all.querySelector('[data-testid="site-picker"]')?.textContent,
        ).toBe("All your sites");
        expect(all.textContent).toContain("for all your sites.");
        const one = render({ sites, siteId: "cafe" });
        expect(
            one.querySelector('[data-testid="site-picker"]')?.textContent,
        ).toBe("Rye Café");
        expect(one.textContent).toContain("for Rye Café.");
    });

    it("names the figures when they couldn't be read, Coming next still said", () => {
        const host = render({ current: { status: "failed" } });
        expect(host.textContent).toContain(
            "Couldn't load your website's figures",
        );
        expect(
            host.querySelector('a[href="/analytics?tab=from"]'),
        ).not.toBeNull();
        expect(host.querySelector('[data-testid="from-next"]')).not.toBeNull();
        expect(
            host.querySelector('[data-testid="website-figures"]'),
        ).toBeNull();
        // One message: the period before isn't named on top of it.
        expect(host.querySelector('[data-testid="from-partial"]')).toBeNull();
    });

    it("names the period before when only it failed, the figures still shown", () => {
        const host = render({ before: { status: "failed" } });
        const partial = host.querySelector('[data-testid="from-partial"]');
        expect(partial?.textContent).toContain(
            "Couldn't load the 4 weeks before. The figures are shown without how they moved.",
        );
        expect(
            host.querySelector('[data-testid="website-figures"]'),
        ).not.toBeNull();
        expect(host.textContent).not.toContain("more than the 4 weeks before");
    });

    it("names the list of websites when it couldn't be read", () => {
        const host = render({ sites: null, sitesFailed: true });
        expect(
            host.querySelector('[data-testid="from-partial"]')?.textContent,
        ).toContain(
            "Couldn't load your list of websites. Another website can be chosen once it loads.",
        );
    });
});
