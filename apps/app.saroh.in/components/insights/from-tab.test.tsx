// @vitest-environment jsdom
/**
 * Where customers come from (DEC-171, plan U14, #1097, and U16, #1101;
 * `IBFromD`, `IBSiteD`, `IBFailedD`): the site picker only with more than
 * one website, the figures for the period, the path from visit to paid and
 * where visitors come from between the figures and the days, from when
 * they are counted, and each read that fails named apart.
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
import type { SourcesRead } from "@/lib/insights/reads";

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

const SOURCES: SourcesRead = {
    period: "4w",
    window: { days: 28, from: "2026-09-22", to: "2026-10-19" },
    siteId: null,
    countedFrom: "2026-09-01",
    countedPart: false,
    path: { visits: 140, looked: 70, started: 20, paid: 10 },
    sources: [
        { source: "instagram", visits: 90, paid: 6 },
        { source: "google", visits: 40, paid: 4 },
        { source: "other", visits: 10, paid: 0 },
    ],
    folded: ["whatsapp"],
    refs: [],
    moreRefs: 0,
};
const OK_SOURCES: SourceRead<SourcesRead> = { status: "ok", data: SOURCES };

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
    sources = OK_SOURCES,
}: {
    sources?: SourceRead<SourcesRead> | null;
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
            sources={sources}
            today="2026-10-19"
        />,
    );
    return host;
}

describe("Where customers come from, now", () => {
    it("says nothing is still to come: no Coming next banner (A9 done)", () => {
        const host = render();
        expect(host.querySelector('[data-testid="from-next"]')).toBeNull();
        expect(host.textContent).not.toContain("Coming next");
    });

    it("draws the path and the sources between the figures and the days", () => {
        const host = render();
        const order = [
            "website-figures",
            "visit-path",
            "sources-table",
            "website-visits",
            "website-pages",
        ].map((id) => {
            const el = host.querySelector(`[data-testid="${id}"]`);
            expect(el, id).not.toBeNull();
            return el;
        });
        for (let i = 1; i < order.length; i++) {
            const before = order[i - 1];
            const after = order[i];
            if (!before || !after) continue;
            expect(
                before.compareDocumentPosition(after) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        }
        expect(host.textContent).toContain(
            "1 in 14 visits ended in a payment.",
        );
        expect(host.textContent).toContain(
            "WhatsApp links had too few visits to show apart",
        );
        // Counted for the whole period: no line saying from when.
        expect(
            host.querySelector('[data-testid="sources-counted-from"]'),
        ).toBeNull();
    });

    it("says from when it counted when that began inside the period", () => {
        const host = render({
            sources: {
                status: "ok",
                data: {
                    ...SOURCES,
                    countedFrom: "2026-10-10",
                    countedPart: true,
                },
            },
        });
        expect(
            host.querySelector('[data-testid="sources-counted-from"]')
                ?.textContent,
        ).toBe(
            "Counted from 10 Oct, when your site began noting where each visit came from.",
        );
    });

    it("says counting starts with the next visit before anything is counted", () => {
        const host = render({
            sources: {
                status: "ok",
                data: {
                    ...SOURCES,
                    countedFrom: null,
                    path: { visits: 0, looked: 0, started: 0, paid: 0 },
                    sources: [],
                    folded: [],
                },
            },
        });
        expect(
            host.querySelector('[data-testid="sources-not-yet"]')?.textContent,
        ).toContain(
            "Where visits come from is counted from the next visit to your site",
        );
        expect(host.querySelector('[data-testid="visit-path"]')).toBeNull();
        // The website's figures are all still there.
        expect(
            host.querySelector('[data-testid="website-figures"]'),
        ).not.toBeNull();
    });

    it("names the sources when they couldn't be read, the figures still shown", () => {
        const host = render({ sources: { status: "failed" } });
        expect(
            host.querySelector('[data-testid="sources-failed"]')?.textContent,
        ).toContain("Couldn't load where visits come from");
        expect(
            host.querySelector('[data-testid="website-figures"]'),
        ).not.toBeNull();
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

    it("names the figures when they couldn't be read, the sources still shown", () => {
        const host = render({ current: { status: "failed" } });
        expect(host.textContent).toContain(
            "Couldn't load your website's figures",
        );
        expect(
            host.querySelector('a[href="/analytics?tab=from"]'),
        ).not.toBeNull();
        expect(host.querySelector('[data-testid="visit-path"]')).not.toBeNull();
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
