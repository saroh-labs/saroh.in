// @vitest-environment jsdom
/**
 * The Price history list (owner, 12 Oct 2026), as the product page, the
 * Service Editor and the course page draw it: rows newest first, a short
 * list with "Show all" when long, nothing at all when there is no history,
 * and a line that says so when it couldn't be read.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessZoneProvider } from "@/components/shared/dates/business-zone";
import type {
    PriceHistoryEntry,
    PriceHistoryPage,
} from "@/lib/price-history/words";

import { PriceHistoryList } from "./price-history";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

const entry = (n: number): PriceHistoryEntry => ({
    id: `e_${n}`,
    // One a day, counting back from 12 Oct 2026.
    at: new Date(Date.UTC(2026, 9, 12 - n, 6, 30)).toISOString(),
    first: false,
    who: { name: "Asha" },
    option: null,
    currency: "INR",
    source: "editor",
    changes: [
        {
            field: "price",
            before: `${700 + n}.00`,
            after: `${701 + n}.00`,
        },
    ],
});
const page = (
    entries: PriceHistoryEntry[],
    nextCursor: string | null = null,
): PriceHistoryPage => ({ entries, nextCursor });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(
    history: PriceHistoryPage | null,
    layout: "wide" | "narrow" = "wide",
) {
    act(() =>
        root.render(
            <BusinessZoneProvider zone="Asia/Kolkata">
                <PriceHistoryList history={history} layout={layout} />
            </BusinessZoneProvider>,
        ),
    );
}

const items = () => Array.from(host.querySelectorAll("li"));
const button = () => host.querySelector("button");
/** The one button's label, and whether it says the list is open. */
const label = () => button()?.textContent;
const expanded = () => button()?.getAttribute("aria-expanded");
const press = () => act(() => button()?.click());

describe("PriceHistoryList", () => {
    it("draws nothing for an item with no history yet", () => {
        draw(page([]));
        expect(host.innerHTML).toBe("");
    });

    it("draws a row with what changed and who, and several fields as lines of one row", () => {
        draw(
            page([
                {
                    ...entry(0),
                    option: "Large",
                    changes: [
                        { field: "price", before: "900.00", after: "950.00" },
                        { field: "mrp", before: null, after: "1200.00" },
                    ],
                },
            ]),
        );
        expect(items()).toHaveLength(1);
        const text = items()[0].textContent;
        expect(text).toContain("Large: Price ₹900 → ₹950");
        expect(text).toContain("Large: MRP set to ₹1,200");
        expect(text).toContain("Asha");
        // Read-only: nothing to press on a short list.
        expect(button()).toBeNull();
    });

    it("keeps a long list short, and Show all opens the rest", () => {
        draw(page(Array.from({ length: 8 }, (_, n) => entry(n))));
        expect(items()).toHaveLength(5);
        // Newest first, as it came.
        expect(items()[0].textContent).toContain("Price ₹700 → ₹701");
        expect(label()).toBe("Show all");
        expect(expanded()).toBe("false");
        press();
        expect(items()).toHaveLength(8);
        expect(label()).toBe("Show fewer");
        expect(expanded()).toBe("true");
        press();
        expect(items()).toHaveLength(5);
    });

    it("exactly five rows need no Show all", () => {
        draw(page(Array.from({ length: 5 }, (_, n) => entry(n))));
        expect(items()).toHaveLength(5);
        expect(button()).toBeNull();
    });

    it("says when there are older changes than it holds, once all are shown", () => {
        draw(
            page(
                Array.from({ length: 6 }, (_, n) => entry(n)),
                "e_5",
            ),
        );
        expect(host.textContent).not.toContain("Showing the latest");
        press();
        expect(host.textContent).toContain("Showing the latest 6 changes.");
    });

    it("in a side column, the day and who sit under what changed", () => {
        draw(page([entry(0)]), "narrow");
        expect(items()[0].textContent).toBe("Price ₹700 → ₹70112 Oct · Asha");
    });

    it("says it couldn't load, with a way to read again, when the read failed", () => {
        draw(null);
        expect(host.textContent).toContain("Couldn't load the price history");
        expect(label()).toBe("Try again");
        expect(items()).toHaveLength(0);
    });
});
