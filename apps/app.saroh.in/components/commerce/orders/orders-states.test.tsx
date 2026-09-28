import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { readOrdersQuery } from "@/lib/orders/list-query";

import {
    OrderLocked,
    OrdersEmpty,
    OrdersFailed,
    OrdersLoading,
    OrdersLocked,
} from "./orders-states";

/**
 * The Orders states (B7) differ by what they ARE, not by how they look: a
 * failure is an alert with a retry and never reads as an empty list; a
 * denial explains and offers nothing to retry; loading is busy and shows no
 * count; and only a business with no orders says "No orders yet".
 */
const noop = () => undefined;

describe("OrdersFailed", () => {
    const html = renderToStaticMarkup(
        <OrdersFailed onRetry={noop} reference="d1g3st" />,
    );

    it("is an alert with Try again, and says nothing was lost", () => {
        expect(html).toContain('role="alert"');
        expect(html).toContain("Couldn&#x27;t load orders");
        expect(html).toContain("Try again");
        expect(html).toContain("nothing has been changed");
        expect(html).toContain("Reference: d1g3st");
    });

    it("never says there are no orders", () => {
        expect(html).not.toMatch(/No orders|No refunds|Nothing left/);
    });
});

describe("OrdersLocked", () => {
    const html = renderToStaticMarkup(
        <OrdersLocked description="Why." note="Who can change it." />,
    );

    it("explains, says who can change it, and keeps the heading", () => {
        expect(html).toContain("You do not have access to this");
        expect(html).toContain("Why.");
        expect(html).toContain("Who can change it.");
        expect(html).toContain(">Orders</h1>");
    });

    it("is a denial, not a failure", () => {
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("Try again");
    });
});

describe("OrderLocked", () => {
    it("is the design's card with the way back", () => {
        const html = renderToStaticMarkup(<OrderLocked text="Your role." />);
        expect(html).toContain("You can&#x27;t open orders");
        expect(html).toContain("Your role.");
        expect(html).toContain("Back to Home");
        expect(html).not.toContain('role="alert"');
    });
});

describe("OrdersLoading", () => {
    const html = renderToStaticMarkup(<OrdersLoading />);

    it("is busy, and says what is on its way", () => {
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain("Loading orders");
    });

    it("shows the tabs without counts, and no empty or failed words", () => {
        expect(html).toContain("Refunded");
        expect(html).not.toMatch(/>\d+</);
        expect(html).not.toMatch(/No orders|Couldn/);
    });
});

describe("OrdersEmpty", () => {
    const empty = (params: Record<string, string>, store: string | null) =>
        renderToStaticMarkup(
            <OrdersEmpty
                query={readOrdersQuery(params)}
                storeName={store}
                go={noop}
            />,
        );

    it("says No orders yet only for a business with none", () => {
        const html = empty({}, "Hill Road");
        expect(html).toContain("No orders yet");
        expect(html).toContain("The first order in Hill Road");
        expect(html).not.toContain('role="alert"');
    });

    it("offers Share your storefront on the first run only when a site is live (B8)", () => {
        const share = (params: Record<string, string>, url: string | null) =>
            renderToStaticMarkup(
                <OrdersEmpty
                    query={readOrdersQuery(params)}
                    storeName="Hill Road"
                    go={noop}
                    shareUrl={url}
                />,
            );
        expect(share({}, "https://rye.saroh.app")).toContain(
            "Share your storefront",
        );
        // No live site: nothing to share, so no button.
        expect(share({}, null)).not.toContain("Share your storefront");
        // Another empty view keeps its own way back.
        const open = share({ tab: "open" }, "https://rye.saroh.app");
        expect(open).not.toContain("Share your storefront");
        expect(open).toContain("View all orders");
    });

    it("says what each tab would hold, with the way back to All", () => {
        const open = empty({ tab: "open" }, null);
        expect(open).toContain("Nothing left to fulfil");
        expect(open).toContain("View all orders");
        const refunded = empty({ tab: "refunded" }, null);
        expect(refunded).toContain("No refunds");
        expect(refunded).not.toContain("No orders yet");
    });

    it("names a search that found nothing, and offers to clear it", () => {
        const html = empty({ q: "Asha", tab: "refunded" }, null);
        expect(html).toContain("No orders match “Asha”");
        expect(html).toContain("Clear search");
    });

    it("says the last 24 hours were empty, not the business", () => {
        const since = new Date(Date.now() - 60_000).toISOString();
        const html = empty({ since }, null);
        expect(html).toContain("No orders in the last 24 hours");
        expect(html).toContain("Show all orders");
        expect(html).not.toContain("No orders yet");
    });
});
