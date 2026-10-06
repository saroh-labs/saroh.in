import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StockLog, StockLogEntry } from "@/lib/stock/service";

import { LogList } from "./log-list";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/stock/screen-actions", () => ({ loadLogPage: vi.fn() }));

/**
 * The stock log on a phone (T3): each entry is two wrapping lines by CSS
 * alone — the size is never truncated, and "15 → 14", the note and which
 * order stay on screen, with no day scrolling sideways.
 */

function entry(over: Partial<StockLogEntry> = {}): StockLogEntry {
    return {
        id: "e1",
        kind: "SOLD",
        word: "Sold",
        quantity: -1,
        before: 15,
        after: 14,
        expected: null,
        counted: null,
        mismatch: false,
        storeId: "s1",
        storeName: "Hill Road",
        productId: "p1",
        productName: "Sourdough loaf",
        variantId: "v1",
        variantTitle: "800g",
        pairId: null,
        reversesId: null,
        undone: false,
        canUndo: false,
        note: null,
        createdAt: "2026-10-05T14:10:00.000Z",
        by: null,
        order: { id: "o1", number: "1066" },
        ...over,
    };
}

function render(entries: StockLogEntry[]) {
    const log: StockLog = {
        entries,
        nextCursor: null,
        seesPeople: true,
        seesOrders: true,
        timezone: "Asia/Kolkata",
    };
    return renderToStaticMarkup(
        <LogList
            log={log}
            filter={{ kind: "all", store: "all", product: "" }}
            storefronts={[
                { id: "s1", name: "Hill Road" },
                { id: "s2", name: "Online" },
            ]}
            products={[{ id: "p1", name: "Sourdough loaf" }]}
            href={() => "/commerce/stock?tab=log"}
            pageSize={50}
        />,
    );
}

describe("LogList on a phone", () => {
    const html = render([
        entry(),
        entry({
            id: "e2",
            kind: "WASTED",
            word: "Wasted",
            quantity: -6,
            before: 20,
            after: 14,
            variantTitle: "400g",
            note: "Dropped the tray",
            by: { id: "u1", name: "Arjun" },
            order: null,
        }),
    ]);

    it("is a list of entries, one item each", () => {
        expect(html.match(/<li /g)).toHaveLength(2);
    });

    it("shows the size in full, never truncated below the desk", () => {
        for (const name of ["Sourdough loaf 800g", "Sourdough loaf 400g"]) {
            const at = html.indexOf(`>${name}<`);
            expect(at).toBeGreaterThan(-1);
            const cls =
                /class="([^"]*)"/
                    .exec(html.slice(html.lastIndexOf("<a", at), at))?.[1]
                    ?.split(" ") ?? [];
            expect(cls).not.toContain("truncate");
            expect(cls).toContain("min-[760px]:truncate");
        }
    });

    it("keeps the after quantity, the note, who and the order", () => {
        expect(html).toContain("15 → 14");
        expect(html).toContain("20 → 14");
        expect(html).toContain("Dropped the tray");
        expect(html).toContain("Arjun");
        expect(html).toContain('href="/commerce/orders/o1"');
        expect(html).toContain("Order #1066");
    });

    it("puts the signed change on line 1 and the rest on line 2", () => {
        expect(html).toContain("−1");
        expect(html).toContain("−6");
        // A full-width break splits the two lines on a phone.
        expect(html).toContain("max-[759px]:basis-full");
        expect(html).toContain("max-[759px]:order-3");
    });

    it("scrolls no day sideways under 760px", () => {
        expect(html.split(/[\s"]/)).not.toContain("overflow-x-auto");
        expect(html.split(/[\s"]/)).not.toContain("min-w-[540px]");
        expect(html).toContain("min-[760px]:min-w-[540px]");
    });
});
