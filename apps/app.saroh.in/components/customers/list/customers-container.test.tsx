// @vitest-environment jsdom
/**
 * Customers on React Query, first paint (owner, 25 Nov): the heading,
 * Import and New customer, the Requests tab, the search, Show and Sort are
 * drawn at once from what the viewer may do; the count and the rows are
 * skeletons until the first page lands, and the tab's count is left out
 * until the open requests are read (never "—" or 0 while on its way).
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
        usePathname: () => "/commerce/customers",
    };
});
vi.mock("@/lib/api/http", () => ({}));

import { CustomersContainer } from "@/components/customers/list/customers-container";
import { renderWithQuery } from "@/lib/query/test-utils";

const VIEW = {
    page: {
        rows: [
            {
                contactId: "c1",
                name: "Priya Raman",
                email: "priya@example.com",
                phone: null,
                signsIn: false,
                possibleDuplicate: false,
                offers: false,
                attention: [],
                hiddenSensitiveCount: 0,
            },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        everyone: 1,
        counts: { all: 1, returning: 0 },
        unlinkedPaying: 0,
        storefronts: [],
        sees: { orders: true, spent: true, subscriptions: false },
        sort: "last",
        chip: "all",
    },
    contacts: 1,
};

let releaseList: () => void;
let releaseOpen: () => void;
const reads: string[] = [];

beforeEach(() => {
    window.history.replaceState(null, "", "/commerce/customers");
    reads.length = 0;
    const list = new Promise<void>((r) => (releaseList = r));
    const open = new Promise<void>((r) => (releaseOpen = r));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            const body = url.startsWith("/api/customers/requests")
                ? (await open, { rows: [] })
                : (await list, VIEW);
            return new Response(JSON.stringify(body), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

function open() {
    return renderWithQuery(
        <CustomersContainer
            defaultSize={50}
            actions={null}
            canRemove
            stores={[{ id: "s1", name: "Hill Road" }]}
            canLink
        />,
    );
}

describe("Customers before its first page", () => {
    it("draws the frame and skeleton rows, then the rows in their place", async () => {
        const { host, unmount } = open();
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Customers");
        expect(host.textContent).toContain("New customer");
        expect(host.textContent).toContain("Requests");
        expect(
            host.querySelector('input[placeholder="Search customers"]'),
        ).not.toBeNull();
        expect(host.querySelector('[aria-label="Show"]')).not.toBeNull();
        expect(host.querySelector('[aria-label="Sort"]')).not.toBeNull();
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.textContent).not.toContain("Priya Raman");
        // The Requests tab's count isn't "—" while it is read.
        expect(host.textContent).not.toContain("—");

        releaseList();
        releaseOpen();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("Priya Raman");
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        unmount();
    });

    it("a search typed before the data keys the read", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { host, unmount } = open();
        await tick();
        const input = host.querySelector<HTMLInputElement>(
            'input[placeholder="Search customers"]',
        )!;
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )!.set!.call(input, "priya");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        act(() => window.dispatchEvent(new PopStateEvent("popstate")));
        await tick();
        vi.useRealTimers();
        expect(window.location.search).toContain("q=priya");
        expect(
            reads.some(
                (u) => u.startsWith("/api/customers?") && u.includes("q=priya"),
            ),
        ).toBe(true);
        releaseList();
        releaseOpen();
        unmount();
    });
});
