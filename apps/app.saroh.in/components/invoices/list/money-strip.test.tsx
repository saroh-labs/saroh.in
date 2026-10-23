// @vitest-environment jsdom
/**
 * The Invoices money strip (DEC-173, U8 #1120): each figure is the filter
 * it names, pressed reads as on, pressed again shows everything; a summary
 * that couldn't be read says so with Try again and never ₹0; a role
 * without money sees counts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type { ListQuery } from "@/lib/invoices/list-view";
import type { InvoiceSummary } from "@/lib/invoices/summary";

import { ChequesLine } from "./cheques-line";
import { MoneyStrip } from "./money-strip";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const inr = (amountMinor: number) => [{ currency: "INR", amountMinor }];
const SUMMARY: InvoiceSummary = {
    zone: "Asia/Kolkata",
    monthStart: "2026-10-01",
    money: true,
    owed: { count: 18, totals: inr(3_297_000), filter: { view: "owed" } },
    overdue: {
        count: 10,
        totals: inr(2_613_000),
        filter: { view: "overdue" },
    },
    paidThisMonth: {
        count: 64,
        totals: inr(4_186_000),
        filter: { paidFrom: "2026-10-01" },
    },
    drafts: { count: 1, totals: inr(750_000), filter: { view: "draft" } },
    chequesWaiting: {
        count: 2,
        totals: inr(1_400_000),
        filter: { view: "cheques" },
    },
};
const ALL: ListQuery = {
    tab: "all",
    owed: false,
    cheques: false,
    paidFrom: null,
    q: "",
};

const s = stage();
beforeEach(() => s.mount());
afterEach(() => {
    s.unmount();
    vi.clearAllMocks();
});

const figure = (key: string) =>
    document.querySelector<HTMLButtonElement>(`[data-figure="${key}"]`);

describe("MoneyStrip", () => {
    it("draws the four figures with their labels, amounts and counts", () => {
        s.render(<MoneyStrip summary={SUMMARY} query={ALL} onPick={vi.fn()} />);
        expect(figure("owed")?.textContent).toBe(
            "Owed to you₹32,97018 invoices",
        );
        expect(figure("overdue")?.textContent).toBe(
            "Overdue₹26,13010 invoices",
        );
        expect(figure("paid")?.textContent).toBe(
            "Paid in October₹41,86064 invoices",
        );
        expect(figure("drafts")?.textContent).toBe("Drafts₹7,5001 draft");
        // Nothing chosen: none is on.
        for (const key of ["owed", "overdue", "paid", "drafts"]) {
            expect(figure(key)?.getAttribute("aria-pressed")).toBe("false");
        }
    });

    it.each([
        ["owed", { view: "owed" }],
        ["overdue", { view: "overdue" }],
        ["paid", { paidFrom: "2026-10-01" }],
        ["drafts", { view: "draft" }],
    ])("pressing %s asks for its filter", (key, filter) => {
        const onPick = vi.fn();
        s.render(<MoneyStrip summary={SUMMARY} query={ALL} onPick={onPick} />);
        figure(key)?.click();
        expect(onPick).toHaveBeenCalledWith(filter);
    });

    it("marks the figure the list shows as on, and pressing it again shows everything", () => {
        const onPick = vi.fn();
        s.render(
            <MoneyStrip
                summary={SUMMARY}
                query={{ ...ALL, tab: "overdue" }}
                onPick={onPick}
            />,
        );
        expect(figure("overdue")?.getAttribute("aria-pressed")).toBe("true");
        expect(figure("owed")?.getAttribute("aria-pressed")).toBe("false");
        figure("overdue")?.click();
        expect(onPick).toHaveBeenCalledWith(null);
    });

    it("says counts and no amounts to a role without money (DEC-098)", () => {
        s.render(
            <MoneyStrip
                summary={{
                    ...SUMMARY,
                    money: false,
                    owed: { count: 18, filter: { view: "owed" } },
                    overdue: { count: 10, filter: { view: "overdue" } },
                    paidThisMonth: {
                        count: 64,
                        filter: { paidFrom: "2026-10-01" },
                    },
                    drafts: { count: 1, filter: { view: "draft" } },
                }}
                query={ALL}
                onPick={vi.fn()}
            />,
        );
        expect(figure("owed")?.textContent).toBe("Owed to you18invoices");
        expect(s.text()).not.toContain("₹");
    });

    it("says it couldn't load the totals, with Try again, never ₹0", () => {
        s.render(<MoneyStrip summary={null} query={ALL} onPick={vi.fn()} />);
        expect(s.text()).toContain("Couldn't load totals");
        expect(s.text()).not.toContain("₹0");
        expect(figure("owed")).toBeNull();
        s.press("Try again");
        expect(refresh).toHaveBeenCalled();
    });
});

describe("ChequesLine", () => {
    it("says how many cheques wait and how much, and filters to them", () => {
        const onPick = vi.fn();
        s.render(<ChequesLine summary={SUMMARY} on={false} onPick={onPick} />);
        const line = document.querySelector<HTMLButtonElement>(
            "[data-cheques-line]",
        );
        expect(line?.textContent).toBe("Cheques not in the bank · 2 · ₹14,000");
        expect(line?.getAttribute("aria-pressed")).toBe("false");
        line?.click();
        expect(onPick).toHaveBeenCalledWith({ view: "cheques" });
    });

    it("reads as on in the cheques view, and pressed again shows everything", () => {
        const onPick = vi.fn();
        s.render(<ChequesLine summary={SUMMARY} on onPick={onPick} />);
        const line = document.querySelector<HTMLButtonElement>(
            "[data-cheques-line]",
        );
        expect(line?.getAttribute("aria-pressed")).toBe("true");
        line?.click();
        expect(onPick).toHaveBeenCalledWith(null);
    });

    it("is not drawn while no cheque waits, or when the summary failed", () => {
        s.render(
            <ChequesLine
                summary={{ ...SUMMARY, chequesWaiting: null }}
                on={false}
                onPick={vi.fn()}
            />,
        );
        expect(document.querySelector("[data-cheques-line]")).toBeNull();
        s.render(<ChequesLine summary={null} on={false} onPick={vi.fn()} />);
        expect(document.querySelector("[data-cheques-line]")).toBeNull();
    });
});
