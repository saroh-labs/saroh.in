import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SourceRead } from "@/lib/analytics/takings";
import { moneyRead, rollingWeeks } from "@/lib/insights/money.fixture";
import type { MoneyRead } from "@/lib/insights/reads";

import { MoneyTab } from "./money-tab";

/** `n` of the same value, typed. */
function times<T>(n: number, value: T): T[] {
    return Array.from({ length: n }, () => value);
}

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/insights/money-actions", () => ({
    readWeekOrders: vi.fn(),
    readOwedBills: vi.fn(),
}));
vi.mock("@/lib/invoices/link-actions", () => ({
    remindWithLink: vi.fn(),
}));

/**
 * Insights' Money tab (DEC-171, plan U12, #1093) in each of its states, as
 * the server draws it: the answer, the bars, the four figures, the last 7
 * days, where the money comes from and who owes (`IBMoneyD`); a role
 * without payments (`IBMemberD`: told who can show them money, never an
 * amount); a read that failed; no sale yet; the first weeks; another
 * currency; each period's bars.
 */

const ok = (data: MoneyRead): SourceRead<MoneyRead> => ({
    status: "ok",
    data,
});

function draw(money: SourceRead<MoneyRead> | null, canRemind = true): string {
    return renderToStaticMarkup(
        <MoneyTab
            money={money}
            retryHref="/analytics?tab=money"
            canRemind={canRemind}
        />,
    );
}

/** The text a person reads, tags and entities gone. */
function text(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

const hrefs = (html: string) =>
    Array.from(html.matchAll(/href="([^"]+)"/g), (m) =>
        m[1].replace(/&amp;/g, "&"),
    );

describe("Money tab", () => {
    it("answers, draws the weeks, says the four figures, the 7 days, the places and who owes (IBMoneyD)", () => {
        const html = draw(ok(moneyRead()));
        const said = text(html);
        expect(said).toContain("Am I making more money?");
        expect(said).toContain(
            "Yes. ₹1,84,600 came in over the last 4 weeks, ₹15,300 more than the 4 before. Your best week was the week of 13 Oct, at ₹50,100.",
        );
        // The readout starts on the best week, and opens its orders.
        expect(said).toContain("Week of 13 Oct · ₹50,100 · 64 payments");
        expect(said).toContain("Orders that week");
        // Twelve bars, each a button named for its week; the best labelled.
        expect(html.match(/aria-pressed=/g)).toHaveLength(12);
        expect(html).toContain('aria-label="Week of 13 Oct, ₹50,100"');
        expect(html.match(/data-best="true"/g)).toHaveLength(1);
        expect(said).toContain("Last 4 weeks The 4 before Earlier");
        for (const label of [
            "Money in",
            "Paid orders and bills",
            "An order is usually",
            "Best week",
        ]) {
            expect(said).toContain(label);
        }
        expect(said).toContain("Up 9% on the 4 weeks before");
        expect(said).toContain(
            "₹50,100 from 13 to 19 Oct, up 17% on the 7 days before. Saturday brought in the most, ₹11,900.",
        );
        expect(said).toContain(
            "More than half comes in at Hill Road. Online orders grew the most, up 18%.",
        );
        expect(said).toContain(
            "₹32,970 on 16 bills. ₹12,530 of it is more than a month late.",
        );
        expect(said).toContain("How these are counted");
        expect(said).toContain(
            "From 288 payments: 271 paid orders and 17 paid invoices, less refunds.",
        );
        // No place at 0% (the chart's floor line is its only ₹0).
        expect(said).not.toMatch(/(^|\s)0%/);
        expect(said.match(/₹0\b/g)).toHaveLength(1);
    });

    it("opens every figure's rows: the period's orders, the best week's, each place's, the bills", () => {
        const links = hrefs(draw(ok(moneyRead())));
        const period =
            "/commerce/orders?date=custom&from=2026-09-22&to=2026-10-19&payment=paid";
        expect(links).toContain(period);
        expect(links).toContain(
            "/commerce/orders?date=custom&from=2026-10-13&to=2026-10-19&payment=paid",
        );
        // A location's money opens that location's orders.
        expect(links).toContain(
            "/commerce/orders?storefront=hill&date=custom&from=2026-09-22&to=2026-10-19&payment=paid",
        );
        expect(links).toContain("/billing/invoices?tab=paid");
        expect(links).toContain("/billing/invoices?view=overdue");
    });

    it("each age of who owes is a control naming its amount and bills", () => {
        const html = draw(ok(moneyRead()));
        expect(html).toContain(
            'aria-label="More than 30 days late: ₹12,530 2 bills"',
        );
        expect(html).toContain('aria-label="Not due yet: ₹6,400 6 bills"');
    });

    it("tells a role without payments who can show them money, never an amount (IBMemberD)", () => {
        for (const money of [{ status: "denied" } as const, null]) {
            const html = draw(money);
            const said = text(html);
            expect(said).toContain(
                "Money is shown to people who can see payments",
            );
            expect(said).toMatch(/Settings › Team|owner or admin/i);
            expect(said).not.toContain("₹");
            expect(html).not.toContain("aria-pressed");
            expect(html).toContain('data-tone="deny"');
        }
    });

    it("says a read that failed, with Try again, never an empty chart", () => {
        const html = draw({ status: "failed" });
        expect(text(html)).toMatch(/Couldn.t load money/);
        expect(hrefs(html)).toContain("/analytics?tab=money");
        expect(html).not.toContain("aria-pressed");
    });

    it("before the first sale says so once, with the two ways to take money, and still who owes", () => {
        const html = draw(
            ok(moneyRead({ hasSales: false, firstSaleOn: null })),
        );
        const said = text(html);
        expect(said).toContain("Your first sale shows here the week it's paid");
        expect(hrefs(html)).toEqual(
            expect.arrayContaining([
                "/commerce/orders/new",
                "/billing/invoices/new",
            ]),
        );
        expect(html).not.toContain("aria-pressed");
        expect(said).toContain("Who owes me?");
        // A shop that has never billed: no "₹0 owed" card either.
        const shop = text(draw(ok(moneyRead({ hasSales: false, owed: null }))));
        expect(shop).not.toContain("Who owes me?");
        expect(shop).not.toContain("₹0");
    });

    it("in the first weeks says there's nothing earlier to compare with yet", () => {
        const said = text(draw(ok(moneyRead({ thin: true, ageDays: 20 }))));
        expect(said).toContain("There is nothing earlier to compare with yet.");
        expect(said).toContain("Nothing earlier to compare with yet");
        expect(said).not.toContain("Up 9%");
    });

    it("keeps money in another currency out, and says so under the chart", () => {
        const html = draw(ok(moneyRead({ otherCurrencies: ["USD"] })));
        expect(text(html)).toContain("Money taken in USD isn't counted here.");
        expect(html).toContain('data-testid="money-other-currency"');
    });

    it("draws 7 days, 4 weeks and 3 months, each with its own bars", () => {
        const seven = draw(
            ok(
                moneyRead(
                    {
                        weeks: rollingWeeks("2026-10-19", times(12, 500_000), [
                            ...times(10, null),
                            "BEFORE",
                            "PERIOD",
                        ]),
                    },
                    "7d",
                ),
            ),
        );
        expect(seven.match(/data-tone="now"/g)).toHaveLength(1);
        expect(seven.match(/data-tone="before"/g)).toHaveLength(1);
        expect(text(seven)).toContain("Last 7 days The 7 before Earlier");

        const months = draw(
            ok(
                moneyRead(
                    {
                        weeks: rollingWeeks("2026-10-19", times(26, 500_000), [
                            ...times<"BEFORE">(13, "BEFORE"),
                            ...times<"PERIOD">(13, "PERIOD"),
                        ]),
                    },
                    "3m",
                ),
            ),
        );
        expect(months.match(/aria-pressed=/g)).toHaveLength(26);
        expect(text(months)).toContain("Last 3 months The 3 months before");
    });

    it("leaves Who owes me out for a role that doesn't read invoices", () => {
        const said = text(draw(ok(moneyRead({ owed: null }))));
        expect(said).not.toContain("Who owes me?");
        expect(said).toContain("Where does the money come from?");
    });
});
