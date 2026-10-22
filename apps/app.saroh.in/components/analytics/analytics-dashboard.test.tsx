import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
    AnalyticsAggregateRow,
    AnalyticsSummary,
} from "@/lib/analytics/summary";
import { summarizeAnalytics } from "@/lib/analytics/summary";

import type { WebsiteRange } from "./analytics-dashboard";
import { AnalyticsDashboard } from "./analytics-dashboard";

/** An org-wide, undimensioned daily row, as the aggregate job writes it. */
const total = (
    type: string,
    count: number,
    date = "2026-10-08",
    uniqueCount = 0,
): AnalyticsAggregateRow => ({
    siteId: "",
    date: `${date}T00:00:00.000Z`,
    type,
    dimension: "",
    dimensionValue: "",
    count,
    uniqueCount,
});

const range: WebsiteRange = {
    from: "2026-09-09",
    to: "2026-10-09",
    label: "4 weeks",
    period: "4w",
};

function render(
    rows: AnalyticsAggregateRow[],
    r: WebsiteRange = range,
    before: AnalyticsSummary | null = null,
    oneSite = false,
): string {
    return renderToStaticMarkup(
        <AnalyticsDashboard
            view={summarizeAnalytics(rows, { from: r.from, to: r.to })}
            before={before}
            range={r}
            oneSite={oneSite}
        />,
    );
}

describe("the website's figures (#919, U14)", () => {
    it("shows the four figures, paid orders net of full refunds", () => {
        const html = render([
            total("site.view", 120),
            total("enquiry.submitted", 2),
            total("order.paid", 5),
            total("order.refunded", 1),
        ]);
        for (const label of [
            "Visits",
            "Visitors",
            "Enquiries",
            "Paid orders and bookings",
        ]) {
            expect(html).toContain(label);
        }
        // Enquiries opens Leads; the orders open the period's paid orders.
        expect(html).toMatch(/href="\/leads"[^>]*>.*?Enquiries/);
        expect(html).toMatch(
            /href="\/commerce\/orders\?date=custom&amp;from=2026-09-09&amp;to=2026-10-09&amp;payment=paid"[^>]*>.*?Paid orders and bookings.*?>4</,
        );
    });

    it("says how each figure moved on the period before", () => {
        const html = render(
            [
                total("site.view", 120, "2026-10-08", 80),
                total("enquiry.submitted", 2),
            ],
            range,
            { siteViews: 100, uniqueVisitors: 80, enquiries: 5, orders: 0 },
        );
        expect(html).toContain("20 more than the 4 weeks before");
        expect(html).toContain("Same as the 4 weeks before");
        expect(html).toContain("3 fewer than the 4 weeks before");
        expect(html).toContain("None in the 4 weeks before either");
        // More is marked up; fewer isn't painted as a loss.
        expect(html).toMatch(/data-tone="up"[^>]*>.*?20 more/);
    });

    it("leaves the changes out when the period before couldn't be read", () => {
        const html = render([total("site.view", 120)]);
        expect(html).not.toContain("the 4 weeks before");
    });

    it("says why the figure may be short while the range reaches back before recording", () => {
        const html = render([total("order.paid", 3)]);
        expect(html).toContain(
            "Orders counts from October 2026, when Insights began recording paid orders",
        );
    });

    it("says plainly when none were paid, and says nothing more once it needn't", () => {
        const later: WebsiteRange = {
            from: "2027-02-01",
            to: "2027-03-02",
            label: "4 weeks",
            period: "4w",
        };
        const html = render([total("site.view", 9, "2027-02-10")], later);
        expect(html).toContain("No paid orders in the last 4 weeks.");
        const quiet = render([total("order.paid", 2, "2027-02-10")], later);
        expect(quiet).not.toContain('data-testid="website-orders-note"');
        // One website chosen: the orders are still the whole business's.
        const one = render(
            [total("order.paid", 2, "2027-02-10")],
            later,
            null,
            true,
        );
        expect(one).toContain(
            "counted for your whole business, not one website",
        );
    });
});

describe("visits every day", () => {
    const week: WebsiteRange = {
        from: "2026-10-13",
        to: "2026-10-19",
        label: "7 days",
        period: "7d",
    };

    it("draws a day nobody came as a baseline, readable like the rest", () => {
        const html = render(
            [
                total("site.view", 12, "2026-10-14", 9),
                total("site.view", 30, "2026-10-17", 21),
            ],
            week,
        );
        const bars = html.match(/<button[^>]*aria-label="[^"]*"/g) ?? [];
        expect(bars).toHaveLength(7);
        expect(html).toContain('aria-label="Tuesday 13 Oct · no visits"');
        expect(html).toContain(
            'aria-label="Saturday 17 Oct · 30 visits · 21 visitors"',
        );
        // The empty day is the baseline's colour, at no height.
        expect(html).toMatch(
            /aria-label="Tuesday 13 Oct · no visits"[^>]*><span[^>]*bg-border-strong[^>]*style="height:0%"/,
        );
        expect(html).toContain(
            "42 visits from 30 visitors. Busiest on Saturday 17 Oct. Nobody visited on 5 days.",
        );
        // The busiest day is where the readout starts.
        expect(html).toMatch(
            /aria-live="polite".*?Saturday 17 Oct · 30 visits/,
        );
    });

    it("draws a week nobody visited, each day there", () => {
        const html = render([], week);
        expect(html.match(/· no visits"/g)).toHaveLength(7);
        expect(html).toContain("No visits to your website in the last 7 days.");
    });

    it("narrows the gaps for three months of days", () => {
        const html = render([], {
            from: "2026-07-20",
            to: "2026-10-19",
            label: "3 months",
            period: "3m",
        });
        expect(html.match(/· no visits"/g)).toHaveLength(92);
        expect(html).toContain("gap-px");
    });
});

describe("which pages people open", () => {
    it("names each page and keeps its path under it", () => {
        const html = render([
            {
                ...total("site.view", 40),
                dimension: "path",
                dimensionValue: "/products/sourdough-loaf",
            },
            {
                ...total("site.view", 80),
                dimension: "path",
                dimensionValue: "/",
            },
        ]);
        expect(html).toContain("Which pages do people open?");
        expect(html).toMatch(
            /Home page.*?>\/<.*?Sourdough loaf.*?\/products\/sourdough-loaf/,
        );
        // A bar against the most opened.
        expect(html).toContain('style="width:50%"');
    });

    it("says when no page was opened", () => {
        expect(render([])).toContain("No page visits yet.");
    });
});
