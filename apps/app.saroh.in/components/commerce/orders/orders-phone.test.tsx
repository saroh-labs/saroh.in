import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderRow } from "@/lib/orders/business-service";
import { readOrdersQuery } from "@/lib/orders/list-query";

import { OrderFiltersSheet } from "./order-filters-sheet";
import { OrderCard } from "./order-row";

/**
 * The Orders list on a phone (B5, DEC-067): a card opens the quick view
 * rather than the full page, and the filters sit behind one Filters button
 * that says how many are on.
 */

function row(over: Partial<OrderRow> = {}): OrderRow {
    return {
        id: "o1",
        orderId: "1042",
        placedAt: "2026-09-27T09:00:00.000Z",
        ageMinutes: 12,
        store: { id: "s1", name: "Hill Road" },
        customer: { id: "c1", name: "Priya Raman" },
        status: "PENDING",
        paymentStatus: "PAID",
        stage: "NEW",
        standing: "UNFULFILLED",
        payment: "PAID",
        currency: "INR",
        total: "480.00",
        unpaidAmount: "0.00",
        itemCount: 2,
        productNames: ["Sourdough loaf"],
        moreProducts: 0,
        fulfilmentType: "PICKUP",
        fulfilmentLabel: "Pick-up",
        steps: [
            { stage: "NEW", label: "New" },
            { stage: "READY", label: "Ready" },
            { stage: "COLLECTED", label: "Collected" },
        ],
        stepIndex: 0,
        ticketName: "Kitchen ticket",
        late: false,
        lateBy: null,
        lateAfterMinutes: 120,
        ...over,
    };
}

const noop = () => undefined;

describe("OrderCard on a phone", () => {
    it("opens the quick view: a button that says it opens a dialog, not a link", () => {
        const html = renderToStaticMarkup(
            <OrderCard row={row()} showStore={false} onOpen={noop} />,
        );
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain("<button");
        expect(html).not.toContain('href="/commerce/orders/o1');
        expect(html).toContain("cursor-pointer");
    });

    it("without onOpen it still links to the order", () => {
        const html = renderToStaticMarkup(
            <OrderCard row={row()} showStore={false} />,
        );
        expect(html).toContain("href=");
        expect(html).not.toContain('aria-haspopup="dialog"');
    });

    it("marks the card whose quick view is open", () => {
        const open = renderToStaticMarkup(
            <OrderCard row={row()} showStore={false} onOpen={noop} open />,
        );
        const closed = renderToStaticMarkup(
            <OrderCard row={row()} showStore={false} onOpen={noop} />,
        );
        expect(open).toContain("border-highlight-border");
        expect(closed).not.toContain("border-highlight-border");
    });
});

describe("OrderFiltersSheet", () => {
    it("is one Filters button, closed, that opens a dialog", () => {
        const html = renderToStaticMarkup(
            <OrderFiltersSheet
                query={readOrdersQuery({})}
                options={null}
                go={noop}
            />,
        );
        expect(html).toContain('aria-label="Filters"');
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain('aria-expanded="false"');
        // The menus are in the sheet, not on the page, until it opens.
        expect(html).not.toContain('aria-label="Filter orders"');
    });

    it("says how many filters are on", () => {
        const html = renderToStaticMarkup(
            <OrderFiltersSheet
                query={readOrdersQuery({ late: "true", payment: "unpaid" })}
                options={null}
                go={noop}
            />,
        );
        expect(html).toContain('aria-label="Filters, 2 on"');
        expect(html).toContain(">2</span>");
    });
});
