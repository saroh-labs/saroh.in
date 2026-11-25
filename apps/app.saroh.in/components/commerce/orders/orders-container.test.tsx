// @vitest-environment jsdom
/**
 * Orders on React Query, first paint (owner, 25 Nov): the real frame is
 * drawn at once from the page's props (heading, New order, search, the
 * status filter) and works before any data; only the rows are skeletons,
 * replaced in place when the page lands; the count and Export wait for it.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (onChange: () => void) => {
        window.addEventListener("popstate", onChange);
        return () => window.removeEventListener("popstate", onChange);
    };
    return {
        useSearchParams: () =>
            new URLSearchParams(
                useSyncExternalStore(subscribe, () => window.location.search),
            ),
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
        usePathname: () => "/commerce/orders",
    };
});

vi.mock("@/lib/api/http", () => ({}));

import { OrdersContainer } from "@/components/commerce/orders/orders-container";
import { renderWithQuery } from "@/lib/query/test-utils";

const PAGE = {
    rows: [
        {
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
            steps: [{ stage: "NEW", label: "New" }],
            stepIndex: 0,
            ticketName: "Kitchen ticket",
            late: false,
            lateBy: null,
            lateAfterMinutes: 120,
        },
    ],
    counts: { all: 1, open: 1, refunded: 0 },
    moment: null,
    share: null,
};

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    window.history.replaceState(null, "", "/commerce/orders");
    reads.length = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            const body = url.startsWith("/api/orders/options")
                ? { filters: null, openByStore: null }
                : (await gate, PAGE);
            return new Response(JSON.stringify(body), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

function open() {
    return renderWithQuery(
        <OrdersContainer
            defaultSize={50}
            notices={null}
            stores={[{ id: "s1", name: "Hill Road" }]}
            businessName="Rye"
            newOrder={null}
            can={{
                stage: true,
                create: true,
                payLink: false,
                refund: false,
                export: true,
                payOnline: false,
            }}
        />,
    );
}

describe("Orders before its first page", () => {
    it("draws the real frame and skeleton rows, then the rows in their place", async () => {
        const { host, unmount } = open();
        await tick();
        // The frame: the heading, the search, the status filter, Export.
        expect(host.querySelector("h1")?.textContent).toContain("Orders");
        expect(
            host.querySelector('input[placeholder="Search orders"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('[aria-label="Order status"]'),
        ).not.toBeNull();
        // The data: skeleton rows, no order, no count, Export waiting.
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.textContent).not.toContain("1042");
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        const exportButton = Array.from(host.querySelectorAll("button")).find(
            (b) => /Export/.test(b.textContent ?? ""),
        );
        expect(exportButton?.disabled).toBe(true);

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("1042");
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        unmount();
    });

    it("a search typed before the data keys the read", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { host, unmount } = open();
        await tick();
        const input = host.querySelector<HTMLInputElement>(
            'input[placeholder="Search orders"]',
        )!;
        act(() => {
            const set = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!;
            set.call(input, "priya");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        // Next reads an in-place address change; the mock hears popstate.
        act(() => window.dispatchEvent(new PopStateEvent("popstate")));
        await tick();
        vi.useRealTimers();
        expect(window.location.search).toContain("q=priya");
        expect(
            reads.some(
                (u) => u.startsWith("/api/orders?") && u.includes("q=priya"),
            ),
        ).toBe(true);
        release();
        unmount();
    });
});
