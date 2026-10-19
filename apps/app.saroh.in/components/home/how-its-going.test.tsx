import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GoingCard } from "@/lib/home/week";

import { HowItsGoing } from "./how-its-going";

/**
 * How it's going (plan U6, `HAPageD`, `HAMemberD`): the last 7 days
 * against the 7 before, each figure a link, and "See how the month went"
 * into Insights on 4 weeks only for someone Insights is open to.
 */

const CARDS: GoingCard[] = [
    {
        key: "sales:INR",
        label: "Sales",
        value: "₹48,250",
        sub: "Up 12% on the 7 days before",
        tone: "up",
        href: "/billing/invoices",
    },
    {
        key: "bookings",
        label: "Bookings",
        value: "22",
        sub: "4 more than the 7 days before",
        tone: "up",
        href: "/bookings",
    },
    {
        key: "orders",
        label: "Orders",
        value: "41",
        sub: "6 more than the 7 days before",
        tone: "up",
        href: "/commerce/orders",
    },
    {
        key: "owed",
        label: "Owed to you",
        value: "₹32,970",
        sub: "16 bills · 10 overdue",
        tone: "bad",
        href: "/billing/invoices?view=unpaid",
    },
];
const INTRO = "The last 7 days, 13 to 19 Oct, compared with the 7 days before";

describe("HowItsGoing", () => {
    it("draws the four figures and the way into Insights", () => {
        const html = renderToStaticMarkup(
            <HowItsGoing cards={CARDS} intro={INTRO} insights />,
        );
        expect(html).toContain("How it&#x27;s going");
        expect(html).toContain(INTRO);
        expect(html).toContain('href="/analytics?period=4w"');
        expect(html).toContain("See how the month went");
        expect(html).toContain("lg:grid-cols-4");
        // Good news and bad news say so in words and in their colour.
        expect(html).toContain('data-tone="up"');
        expect(html).toContain('data-tone="bad"');
        expect(html).toContain("text-destructive-subtle-foreground");
    });

    it("draws two cards and no Insights link for a Member", () => {
        const html = renderToStaticMarkup(
            <HowItsGoing
                cards={CARDS.filter(
                    (c) => c.key === "bookings" || c.key === "orders",
                )}
                intro={INTRO}
                insights={false}
            />,
        );
        expect(html).not.toContain("See how the month went");
        expect(html).not.toContain("₹");
        expect(html).not.toContain("lg:grid-cols-4");
    });

    it("stacks two across on the interim phone layout", () => {
        const html = renderToStaticMarkup(
            <HowItsGoing cards={CARDS} intro={INTRO} insights layout="stack" />,
        );
        expect(html).toContain("grid-cols-2");
        expect(html).not.toContain("lg:grid-cols-4");
    });

    it("draws nothing without figures", () => {
        expect(
            renderToStaticMarkup(
                <HowItsGoing cards={[]} intro={INTRO} insights />,
            ),
        ).toBe("");
    });
});
