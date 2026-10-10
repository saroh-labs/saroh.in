import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AnalyticsAggregateRow } from "@/lib/analytics/summary";
import { summarizeAnalytics } from "@/lib/analytics/summary";

import { AnalyticsDashboard } from "./analytics-dashboard";

/** An org-wide, undimensioned daily row, as the aggregate job writes it. */
const total = (type: string, count: number): AnalyticsAggregateRow => ({
    siteId: "",
    date: "2026-10-08T00:00:00.000Z",
    type,
    dimension: "",
    dimensionValue: "",
    count,
    uniqueCount: 0,
});

const range = { from: "2026-09-09", to: "2026-10-09", label: "30 days" };

function render(rows: AnalyticsAggregateRow[], r = range): string {
    return renderToStaticMarkup(
        <AnalyticsDashboard view={summarizeAnalytics(rows)} range={r} />,
    );
}

describe("the website's Orders tile (#919)", () => {
    it("shows paid orders net of full refunds, beside the other three", () => {
        const html = render([
            total("site.view", 120),
            total("enquiry.submitted", 2),
            total("order.paid", 5),
            total("order.refunded", 1),
        ]);
        for (const label of ["Visits", "Visitors", "Enquiries", "Orders"]) {
            expect(html).toContain(label);
        }
        // The tile reads 4 and opens the paid orders of the range's days.
        expect(html).toMatch(
            /href="\/commerce\/orders\?date=custom&amp;from=2026-09-09&amp;to=2026-10-09&amp;payment=paid"[^>]*>.*?Orders.*?>4</,
        );
    });

    it("says why the figure may be short while the range reaches back before recording", () => {
        const html = render([total("order.paid", 3)]);
        expect(html).toContain(
            "Orders counts from October 2026, when Insights began recording paid orders",
        );
    });

    it("says plainly when none were paid, and says nothing more once it needn't", () => {
        const html = render([total("site.view", 9)], {
            from: "2027-02-01",
            to: "2027-03-02",
            label: "30 days",
        });
        expect(html).toContain("No paid orders in the last 30 days.");
        const quiet = render([total("order.paid", 2)], {
            from: "2027-02-01",
            to: "2027-03-02",
            label: "30 days",
        });
        expect(quiet).not.toContain('data-testid="website-orders-note"');
    });
});
