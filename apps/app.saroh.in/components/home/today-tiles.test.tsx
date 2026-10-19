import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TileView } from "@/lib/home/tiles";

import { TodayTiles } from "./today-tiles";

/**
 * Home A's tiles (plan U6, `HAPageD`, `HAMemberD`, `HAFailedD`): each a
 * link to its screen, four or three across, a dash (never 0) where a read
 * failed, and the business's figures left masked in a recording.
 */

const tile = (over: Partial<TileView>): TileView => ({
    key: "bookings",
    label: "Bookings today",
    value: "6",
    sub: "Next at 11:30 am, Sourdough basics",
    href: "/calendar",
    ...over,
});

const FOUR: TileView[] = [
    tile({}),
    tile({
        key: "toPack",
        label: "To pack or hand over",
        value: "7 orders",
        sub: "3 due today",
        href: "/commerce/orders",
    }),
    tile({
        key: "moneyIn",
        label: "Money in today",
        value: "₹8,240",
        sub: "14 payments so far today",
        href: "/billing/invoices",
        currency: "INR",
    }),
    tile({
        key: "came",
        label: "Came",
        value: "3 of 6",
        sub: "Kavya is next, at 12:00 pm",
        href: "/bookings",
    }),
];

describe("TodayTiles", () => {
    it("draws four tiles across a wide desk, each a link to its screen", () => {
        const html = renderToStaticMarkup(<TodayTiles tiles={FOUR} />);
        expect(html).toContain('aria-label="Today at a glance"');
        expect(html).toContain("lg:grid-cols-4");
        for (const href of [
            "/calendar",
            "/commerce/orders",
            "/billing/invoices",
            "/bookings",
        ]) {
            expect(html).toContain(`href="${href}"`);
        }
        expect(html).toContain("lucide-indian-rupee");
    });

    it("draws three for a role without money", () => {
        const html = renderToStaticMarkup(
            <TodayTiles tiles={FOUR.filter((t) => t.key !== "moneyIn")} />,
        );
        expect(html).toContain("lg:grid-cols-3");
        expect(html).not.toContain("Money in today");
    });

    it("says a failed tile with the dash and a word for a screen reader", () => {
        const html = renderToStaticMarkup(
            <TodayTiles
                tiles={[
                    tile({
                        key: "moneyIn",
                        label: "Money in today",
                        value: null,
                        absent: "Not known",
                        sub: "Couldn't check payments",
                    }),
                ]}
            />,
        );
        expect(html).toContain("data-absent");
        expect(html).toContain("Not known");
        expect(html).toContain("Couldn&#x27;t check payments");
        expect(html).not.toMatch(/>0</);
    });

    it("lets a recording read the tile's name, never its figure", () => {
        const html = renderToStaticMarkup(<TodayTiles tiles={FOUR} />);
        expect(html).toMatch(/data-ph-unmask=""[^>]*>.*Bookings today/);
        expect(html).not.toMatch(/data-ph-unmask=""[^>]*>₹/);
    });

    it("draws nothing with no tiles", () => {
        expect(renderToStaticMarkup(<TodayTiles tiles={[]} />)).toBe("");
    });
});
