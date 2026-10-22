import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AnalyticsSummary } from "@/lib/analytics/summary";
import type { SourceRead } from "@/lib/analytics/takings";
import type { InsightsAddress } from "@/lib/insights/period";
import { periodWindow } from "@/lib/insights/period";
import type {
    MoneyRead,
    MoneyWeekRead,
    SellsRead,
    SourcesRead,
} from "@/lib/insights/reads";

import { InsightsTabs } from "./insights-tabs";
import { Overview } from "./overview";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * Insights' Overview (DEC-171, plan U10, #1089), in each of its states and
 * for each kind of person, drawn as the server sends it: the answers and
 * their links (`IBOverviewD`), the last 7 days (`IBPeriodD`), the first
 * weeks (`IBThinD`), before the first sale (`IBNoSalesD`), a role with
 * Insights and without payments (`IBMemberD`: counts only, never an
 * amount), and one part that couldn't be read (`IBFailedD`).
 */

const ADDRESS: InsightsAddress = {
    period: "4w",
    tab: "overview",
    siteId: null,
};

const WEEKS: MoneyWeekRead[] = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(Date.UTC(2026, 6, 27 + i * 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        takingsMinor: (38 + i) * 100_000,
        orders: 60,
        payments: 64,
        in: i >= 8 ? "PERIOD" : i >= 4 ? "BEFORE" : null,
    };
});

const MONEY: MoneyRead = {
    period: "4w",
    zone: "Asia/Kolkata",
    currency: "INR",
    otherCurrencies: [],
    window: periodWindow("4w", "2026-10-19"),
    startedOn: "2025-01-06",
    ageDays: 651,
    thin: false,
    hasSales: true,
    firstSaleOn: "2025-01-10",
    moneyIn: {
        amountMinor: 18_460_000,
        beforeMinor: 16_930_000,
        change: { kind: "UP", percent: 9 },
        payments: 288,
        paymentsBefore: 270,
        orders: 271,
        ordersBefore: 255,
        bills: 17,
        billsBefore: 15,
    },
    bestWeek: {
        start: WEEKS[11].start,
        end: WEEKS[11].end,
        takingsMinor: WEEKS[11].takingsMinor,
    },
    weeks: WEEKS,
    days: [],
};

const SELLS = (money: boolean): SellsRead => ({
    period: "4w",
    zone: "Asia/Kolkata",
    currency: "INR",
    window: periodWindow("4w", "2026-10-19"),
    ageDays: 651,
    thin: false,
    money,
    bestSellers: {
        rows: [
            {
                productId: "p1",
                name: "Sourdough loaf",
                sold: 412,
                soldBefore: 400,
                amountMinor: money ? 7_416_000 : null,
                isNew: false,
            },
        ],
        total: 1,
    },
    booked: { rows: [], total: 0, bookings: 0, enough: false },
});

const WEBSITE: SourceRead<AnalyticsSummary> = {
    status: "ok",
    data: { siteViews: 1689, uniqueVisitors: 1109, enquiries: 23, orders: 159 },
};

const ok = <T,>(data: T): SourceRead<T> => ({ status: "ok", data });

function draw(props: Partial<Parameters<typeof Overview>[0]> = {}): string {
    return renderToStaticMarkup(
        <Overview
            address={ADDRESS}
            money={ok(MONEY)}
            sells={ok(SELLS(true))}
            website={WEBSITE}
            {...props}
        />,
    );
}

/** The text a person reads, tags and entities gone. */
const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");

describe("the Overview, for an owner", () => {
    it("answers the three questions, each leading to its tab (IBOverviewD)", () => {
        const html = draw();
        const said = text(html);
        expect(said).toContain("Am I making more money?");
        expect(said).toContain(
            "Yes. ₹1,84,600 came in over the last 4 weeks, ₹15,300 more than the 4 before (up 9%).",
        );
        expect(said).toContain("What sells, who books?");
        expect(said).toContain("Sourdough loaf sells most.");
        expect(said).toContain("₹74,160");
        expect(said).toContain("Where do customers come from?");
        expect(said).toContain(
            "1,689 visits from 1,109 visitors, 23 enquiries and 159 online orders.",
        );
        // Sources weren't read: the website's figures answer alone, and
        // nothing says it comes next (U16).
        expect(said).not.toContain("comes next");
        // Each answer opens its tab, keeping the period.
        expect(html).toContain('href="/analytics?tab=money"');
        expect(html).toContain('href="/analytics?tab=sells"');
        expect(html).toContain('href="/analytics?tab=from"');
        // How it was counted, at the foot.
        expect(said).toContain("How these are counted");
        expect(said).toContain("updated every hour");
        expect(said).toContain(
            "From 288 payments: 271 paid orders and 17 paid invoices, less refunds.",
        );
        // Nothing failed, so no notice.
        expect(said).not.toContain("Couldn't load");
    });

    it("keeps the period in every way on", () => {
        const html = draw({ address: { ...ADDRESS, period: "7d" } });
        expect(html).toContain('href="/analytics?tab=money&amp;period=7d"');
        expect(html).toContain('href="/analytics?tab=from&amp;period=7d"');
    });

    it("draws the twelve weeks as a picture with what it shows said", () => {
        const html = draw();
        expect(html).toMatch(
            /role="img" aria-label="Money in each of the last 12 weeks/,
        );
        // The period, the period before and earlier, named in the legend.
        for (const label of ["Last 4 weeks", "The 4 before", "Earlier"]) {
            expect(text(html)).toContain(label);
        }
    });

    it("masks the business's figures and names in a recording", () => {
        const html = draw();
        expect(html).toMatch(/data-ph-mask=""[^>]*>[^<]*<b[^>]*>Yes\./);
        expect(html).toMatch(/<ol[^>]*data-ph-mask=""/);
    });

    it("has a place for the suggestion, above the answers", () => {
        const html = draw({ suggestion: <aside>What to do next</aside> });
        expect(html.indexOf("What to do next")).toBeLessThan(
            html.indexOf("Am I making more money?"),
        );
    });
});

describe("the Overview, for a role with Insights and without payments (IBMemberD)", () => {
    const html = draw({
        money: { status: "denied" },
        sells: ok(SELLS(false)),
    });
    const said = text(html);

    it("says who sees money and who can change that, instead of the money", () => {
        expect(said).toContain(
            "Money is shown to people who can see payments.",
        );
        expect(said).toContain(
            "An owner or admin can change this in Settings › Team.",
        );
        expect(html).toContain('data-state="denied"');
    });

    it("shows counts and never an amount", () => {
        expect(said).toContain("412 sold");
        expect(said).not.toMatch(/₹/);
        // Nor the line about the payments behind the money.
        expect(said).not.toContain("From 288 payments");
    });

    it("still answers what sells and where customers come from", () => {
        expect(said).toContain("Sourdough loaf sells most.");
        expect(said).toContain("1,689 visits");
    });
});

describe("the Overview's other states", () => {
    it("before the first sale: one message with the two ways to take one (IBNoSalesD)", () => {
        const html = draw({
            money: ok({ ...MONEY, hasSales: false, firstSaleOn: null }),
            website: {
                status: "ok",
                data: {
                    siteViews: 48,
                    uniqueVisitors: 31,
                    enquiries: 0,
                    orders: 0,
                },
            },
        });
        const said = text(html);
        expect(said).toContain("Your first sale shows here the week it's paid");
        expect(html).toContain('href="/commerce/orders/new"');
        expect(html).toContain('href="/billing/invoices/new"');
        expect(said).toContain("48 visits from 31 visitors. No orders yet.");
        // No money chart and no ₹0.
        expect(said).not.toContain("Am I making more money?");
        expect(said).not.toContain("₹0");
    });

    it("the first weeks: nothing earlier to compare with yet (IBThinD)", () => {
        const html = draw({
            money: ok({
                ...MONEY,
                thin: true,
                startedOn: "2026-09-28",
                ageDays: 21,
                moneyIn: { ...MONEY.moneyIn, amountMinor: 2_140_000 },
            }),
        });
        const said = text(html);
        expect(said).toContain(
            "₹21,400 came in over your first 3 weeks on Saroh. There is nothing earlier to compare with yet. Comparing starts after 8 weeks.",
        );
        expect(said).toContain("See the orders");
        expect(html).toContain(
            'href="/commerce/orders?date=custom&amp;from=2026-09-28&amp;to=2026-10-19&amp;payment=paid"',
        );
    });

    it("the last 7 days: a bar a day (IBPeriodD)", () => {
        const days = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-10-${String(13 + i).padStart(2, "0")}`,
            amountMinor: 500_000,
            payments: 1,
        }));
        const html = draw({
            address: { ...ADDRESS, period: "7d" },
            money: ok({
                ...MONEY,
                period: "7d",
                window: periodWindow("7d", "2026-10-19"),
                days,
            }),
        });
        expect(html).toContain('aria-label="Money in each of the last 7 days');
        for (const day of ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]) {
            expect(text(html)).toContain(day);
        }
    });

    it("a part that couldn't be read is named once, with Try again; the rest shows (IBFailedD)", () => {
        const html = draw({ website: { status: "failed" } });
        const said = text(html);
        expect(said).toContain(
            "Couldn't load your website's figures. Money and what sells are complete.",
        );
        expect(said).toContain("Try again");
        expect(said.match(/Try again/g)).toHaveLength(1);
        // Its card says so; the others are whole.
        expect(said).toContain("Couldn't load just now.");
        expect(said).toContain("Sourdough loaf sells most.");
        expect(said).toContain("₹1,84,600");
    });

    it("money that failed is never drawn as nothing", () => {
        const said = text(draw({ money: { status: "failed" } }));
        expect(said).toContain("Couldn't load money.");
        expect(said).not.toContain("₹0");
        expect(said).not.toContain("Nothing came in");
    });
});

describe("the tabs", () => {
    it("are four addresses that keep the period and the website, none marked Next", () => {
        const html = renderToStaticMarkup(
            <InsightsTabs
                address={{ period: "3m", tab: "money", siteId: "site_1" }}
            />,
        );
        expect(html).toContain('aria-label="Insights"');
        expect(html).toContain('href="/analytics?period=3m&amp;siteId=site_1"');
        expect(html).toContain(
            'href="/analytics?tab=sells&amp;period=3m&amp;siteId=site_1"',
        );
        expect(html).toMatch(/aria-current="page"[^>]*>Money</);
        expect(text(html)).toContain("Where customers come from");
        // Sources and the path are built (U16): nothing is still to come.
        expect(text(html)).not.toMatch(/\bNext\b/);
    });
});

describe("the Overview's sources answer (U16)", () => {
    const SOURCES: SourcesRead = {
        period: "4w",
        window: { days: 28, from: "2026-09-22", to: "2026-10-19" },
        siteId: null,
        countedFrom: "2026-09-01",
        countedPart: false,
        path: { visits: 1109, looked: 612, started: 214, paid: 159 },
        sources: [
            { source: "instagram", visits: 455, paid: 52 },
            { source: "google", visits: 288, paid: 61 },
            { source: "whatsapp", visits: 166, paid: 31 },
            { source: "direct", visits: 133, paid: 12 },
            { source: "other", visits: 67, paid: 3 },
        ],
        folded: [],
        refs: [],
        moreRefs: 0,
    };

    it("names where visits come from and how many paid, the website's figures kept under it", () => {
        const html = draw({ sources: ok(SOURCES) });
        const said = text(html);
        expect(said).toContain(
            "Instagram brings the most visits. 1 in 7 visits ended in a payment.",
        );
        expect(said).toContain("Instagram 455 visits");
        expect(said).toContain("Google search 288 visits");
        expect(said).toContain("WhatsApp links 166 visits");
        expect(said).not.toContain("Typed your address");
        // Every figure the card had stays.
        expect(said).toContain(
            "1,689 visits from 1,109 visitors, 23 enquiries and 159 online orders.",
        );
        expect(html).toContain('href="/analytics?tab=from"');
        // Counts, never a percentage, in this card.
        const card = said.slice(
            said.indexOf("Where do customers come from?"),
            said.indexOf("How these are counted"),
        );
        expect(card).not.toMatch(/%/);
    });

    it("says counting starts with the next visit when nothing is counted yet", () => {
        const said = text(
            draw({
                sources: ok({
                    ...SOURCES,
                    countedFrom: null,
                    path: { visits: 0, looked: 0, started: 0, paid: 0 },
                    sources: [],
                }),
            }),
        );
        expect(said).toContain(
            "1,689 visits from 1,109 visitors, 23 enquiries and 159 online orders.",
        );
        expect(said).toContain(
            "Where visits come from is counted from the next visit to your site.",
        );
    });

    it("keeps the website's answer when the sources couldn't be read", () => {
        const said = text(draw({ sources: { status: "failed" } }));
        expect(said).toContain(
            "1,689 visits from 1,109 visitors, 23 enquiries and 159 online orders.",
        );
        expect(said).not.toContain("brings the most visits");
    });
});
