// @vitest-environment jsdom
/**
 * Money's bars and sheets (DEC-171, plan U12, #1093; `IBWeekD`/`P`,
 * `IBOwedD`/`P`): pointing at or focusing a bar reads it; choosing it opens
 * that week's orders, read as the sheet opens, with "N more" and Open
 * these orders; a read that fails says so with Try again, never "none".
 * An age of Who owes me opens its bills, with Send reminder only on a late
 * bill and only for a role that may send one.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readOwedBills, readWeekOrders } from "@/lib/insights/money-actions";
import { moneyWeekBars, owedView } from "@/lib/insights/money-words";
import { moneyRead } from "@/lib/insights/money.fixture";

import { MoneyChart } from "./money-chart";
import { OwedByAge } from "./owed-by-age";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/insights/money-actions", () => ({
    readWeekOrders: vi.fn(),
    readOwedBills: vi.fn(),
}));
vi.mock("@/lib/invoices/link-actions", () => ({
    remindWithLink: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(readWeekOrders).mockReset();
    vi.mocked(readOwedBills).mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

/** Let the sheet's read settle. */
async function settle() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function drawChart() {
    const read = moneyRead();
    const { bars, chart, initial } = moneyWeekBars(read);
    act(() =>
        root.render(
            <MoneyChart
                bars={bars}
                chart={chart}
                initial={initial}
                read={read}
            />,
        ),
    );
}

const readout = () =>
    host.querySelector('[data-testid="money-readout"]')?.textContent;
const bar = (name: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label^="${name}"]`);
const body = () => document.body.textContent;

describe("Money's bars", () => {
    it("reads a bar on focus and on a mouse pointing at it", () => {
        drawChart();
        expect(readout()).toBe("Week of 13 Oct · ₹50,100 · 64 payments");
        act(() => bar("Week of 28 Jul")?.focus());
        expect(readout()).toBe("Week of 28 Jul · ₹38,000 · 64 payments");
        // jsdom has no PointerEvent: a mouse's pointerover, as React reads it.
        const over = new MouseEvent("pointerover", { bubbles: true });
        Object.defineProperty(over, "pointerType", { value: "mouse" });
        act(() => {
            bar("Week of 15 Sep")?.dispatchEvent(over);
        });
        expect(readout()).toBe("Week of 15 Sep · ₹41,000 · 64 payments");
        expect(bar("Week of 13 Oct")?.getAttribute("aria-pressed")).toBe(
            "false",
        );
    });

    it("opens a week's orders when a bar is chosen, with N more and Open these orders", async () => {
        vi.mocked(readWeekOrders).mockResolvedValue({
            ok: true,
            data: {
                total: 60,
                rows: [
                    {
                        id: "o1",
                        title: "#1098 · Neha Joshi",
                        line: "Hill Road · Sourdough loaf",
                        amount: "₹1,860",
                    },
                ],
            },
        });
        drawChart();
        act(() => bar("Week of 13 Oct")?.click());
        await settle();
        expect(readWeekOrders).toHaveBeenCalledWith("2026-10-13", "2026-10-19");
        expect(body()).toContain("₹50,100 from 64 payments");
        expect(body()).toContain("Your best week in 12.");
        expect(body()).toContain("#1098 · Neha Joshi");
        expect(body()).toContain("59 more orders");
        expect(body()).toContain("And 4 paid invoices");
        const open = Array.from(document.querySelectorAll("a")).find(
            (a) => a.textContent === "Open these orders",
        );
        expect(open?.getAttribute("href")).toBe(
            "/commerce/orders?date=custom&from=2026-10-13&to=2026-10-19&payment=paid",
        );
    });

    it("opens the readout's week from Orders that week", async () => {
        vi.mocked(readWeekOrders).mockResolvedValue({
            ok: true,
            data: { total: 0, rows: [] },
        });
        drawChart();
        act(() => bar("Week of 28 Jul")?.focus());
        const button = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Orders that week",
        );
        act(() => button?.click());
        await settle();
        expect(readWeekOrders).toHaveBeenCalledWith("2026-07-28", "2026-08-03");
    });

    it("says a week's orders couldn't load, with Try again, never none", async () => {
        vi.mocked(readWeekOrders).mockResolvedValue({
            ok: false,
            denied: false,
        });
        drawChart();
        act(() => bar("Week of 13 Oct")?.click());
        await settle();
        expect(body()).toMatch(/Couldn.t load that week's orders/);
        expect(body()).not.toContain("No paid orders");
        vi.mocked(readWeekOrders).mockResolvedValue({
            ok: true,
            data: { total: 1, rows: [] },
        });
        const retry = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent.includes("Try again"),
        );
        act(() => retry?.click());
        await settle();
        expect(readWeekOrders).toHaveBeenCalledTimes(2);
    });
});

describe("Who owes me", () => {
    function drawOwed(canRemind: boolean) {
        const view = owedView(moneyRead());
        if (!view) throw new Error("fixture");
        act(() =>
            root.render(
                <OwedByAge
                    text={view.text}
                    rows={view.rows}
                    href={view.href}
                    zone="Asia/Kolkata"
                    canRemind={canRemind}
                />,
            ),
        );
    }

    const bills = [
        {
            id: "inv-1",
            who: "Shruti Menon",
            line: "RC/26-27/0056 · was due 20 Sep · 29 days late",
            leftMinor: 1_125_000,
            currency: "INR",
            daysLate: 29,
        },
    ];

    it("opens an age's bills, with Send reminder on a late bill", async () => {
        vi.mocked(readOwedBills).mockResolvedValue({ ok: true, data: bills });
        drawOwed(true);
        act(() => bar("More than 30 days late")?.click());
        await settle();
        expect(readOwedBills).toHaveBeenCalledWith(
            "lateOver30",
            "Asia/Kolkata",
        );
        expect(body()).toContain("₹12,530 more than 30 days late");
        expect(body()).toContain("Shruti Menon");
        expect(body()).toContain("29 days late");
        expect(body()).toContain("Send reminder");
        const open = Array.from(document.querySelectorAll("a")).find(
            (a) => a.textContent === "Open unpaid bills",
        );
        expect(open?.getAttribute("href")).toBe(
            "/billing/invoices?view=overdue",
        );
    });

    it("offers no reminder to a role that can't send one, nor on a bill not yet due", async () => {
        vi.mocked(readOwedBills).mockResolvedValue({ ok: true, data: bills });
        drawOwed(false);
        act(() => bar("More than 30 days late")?.click());
        await settle();
        expect(body()).toContain("Shruti Menon");
        expect(body()).not.toContain("Send reminder");

        act(() => root.unmount());
        root = createRoot(host);
        drawOwed(true);
        act(() => bar("Not due yet")?.click());
        await settle();
        expect(body()).not.toContain("Send reminder");
    });

    it("says the bills couldn't load, with Try again", async () => {
        vi.mocked(readOwedBills).mockResolvedValue({
            ok: false,
            denied: false,
        });
        drawOwed(true);
        act(() => bar("1 to 30 days late")?.click());
        await settle();
        expect(body()).toMatch(/Couldn.t load these bills/);
    });
});
