import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OrderRow } from "@/lib/orders/business-service";
import type { OrderRead } from "@/lib/orders/read";

import { OrderQuickView, QuickViewBody } from "./order-quick-view";

/**
 * The Orders quick view (B5) after the "Saroh Orders Screen" design
 * (DEC-073): its close is a plain X that greys only on hover, named for
 * what it closes, and the customer's name is a Saffron link to their
 * Customer Detail.
 */

// The sheet draws in place, so its header renders without a portal.
vi.mock("@saroh/ui/sheet", () => {
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Sheet: Pass,
        SheetContent: ({ children }: { children?: ReactNode }) => (
            <div role="dialog">{children}</div>
        ),
        SheetTitle: ({ children }: { children?: ReactNode }) => (
            <h2>{children}</h2>
        ),
        SheetDescription: ({ children }: { children?: ReactNode }) => (
            <p>{children}</p>
        ),
        SheetClose: ({
            children,
            className,
        }: {
            children?: ReactNode;
            className?: string;
        }) => (
            <button type="button" className={className}>
                {children}
            </button>
        ),
    };
});
vi.mock("@/lib/orders/list-actions", () => ({
    loadOrderQuickView: () => new Promise(() => undefined),
}));
vi.mock("./use-order-step", () => ({
    useOrderStep: () => ({ busy: false, take: () => undefined }),
}));

const row = {
    id: "o1",
    orderId: "1042",
    placedAt: "2026-09-27T09:00:00.000Z",
    store: { id: "s1", name: "Hill Road" },
    customer: { id: "c1", name: "Priya Raman" },
    fulfilmentLabel: "Pick-up",
} as unknown as OrderRow;

function order(over: Partial<OrderRead> = {}): OrderRead {
    return {
        id: "o1",
        orderId: "1042",
        status: "PENDING",
        paymentStatus: "PAID",
        refundStanding: "NONE",
        fulfilmentType: "PICKUP",
        fulfilmentLabel: "Pick-up",
        steps: [
            { stage: "NEW", label: "New" },
            { stage: "READY", label: "Ready" },
        ],
        stepIndex: 0,
        store: { id: "s1", name: "Hill Road" },
        customer: {
            id: "c1",
            name: "Priya Raman",
            phone: null,
            contactId: "ct_1",
            orderCount: 2,
            firstOrderAt: null,
        },
        walkIn: null,
        deliveryAddress: null,
        notes: null,
        items: [],
        money: null,
        attention: { entries: [], hiddenSensitiveCount: 0 },
        ...over,
    } as unknown as OrderRead;
}

describe("OrderQuickView — close (DEC-073)", () => {
    const html = renderToStaticMarkup(
        <OrderQuickView row={row} can={{} as never} onOpenChange={vi.fn()} />,
    );
    const close = /<button type="button" class="([^"]*)">(.*?)<\/button>/.exec(
        html,
    );

    it("is a plain X, not a grey square, named for what it closes", () => {
        expect(close?.[2]).toContain("Close quick view");
        expect(close?.[1]).toContain("bg-transparent");
        expect(close?.[1]).not.toMatch(/(^| )bg-muted( |$)/);
    });

    it("has a pointer, and hover, pressed and focus states", () => {
        expect(close?.[1]).toContain("cursor-pointer");
        expect(close?.[1]).toContain("hover:bg-muted");
        expect(close?.[1]).toContain("active:");
        expect(close?.[1]).toContain("focus-visible:ring-2");
    });
});

describe("QuickViewBody — the customer (DEC-073)", () => {
    it("names them as a Saffron link to Customer Detail", () => {
        const html = renderToStaticMarkup(<QuickViewBody order={order()} />);
        const link = /<a[^>]*href="\/customers\/ct_1"[^>]*>([^<]*)<\/a>/.exec(
            html,
        );
        expect(link?.[1]).toBe("Priya Raman");
        expect(link?.[0]).toContain("text-brand");
        expect(link?.[0]).toContain("hover:text-foreground");
        expect(link?.[0]).toContain("focus-visible:ring-2");
    });

    it("a walk-in has no record to link to", () => {
        const html = renderToStaticMarkup(
            <QuickViewBody
                order={order({
                    customer: null,
                    walkIn: { name: "Asha", phone: null },
                } as unknown as Partial<OrderRead>)}
            />,
        );
        expect(html).toContain("Walk-in · Asha");
        expect(html).not.toContain("text-brand");
    });
});
