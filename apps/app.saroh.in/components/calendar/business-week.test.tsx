// @vitest-environment jsdom
/**
 * The calendar's Week (plan 005 E25) on the screen, on a week shaped like
 * Rye & Co.'s of 14 September: an order on Thursday, a pick-up and a late
 * order on Saturday. Today is Friday the 18th. The columns list each day's
 * things in time order, ‹ › step by week, Month | Week switches view, and a
 * day's header opens the day as a sheet.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
} from "@/lib/calendar/types";
import { weekDates } from "@/lib/calendar/week";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/calendar",
}));

import { BusinessWeek } from "@/components/calendar/business-week";

const at = (date: string, time: string) =>
    new Date(`${date}T${time}:00+05:30`).toISOString();

function order(id: string, date: string, time: string, late = false) {
    return {
        id,
        kind: "paid",
        title: id,
        subtitle: "Meera",
        at: at(date, time),
        link: { type: "order", id },
        amount: "640.00",
        currency: "INR",
        ...(late ? { flags: ["late"] } : {}),
    } satisfies CalendarItem;
}

function day(
    date: string,
    layers: Partial<Record<LayerKey, CalendarItem[]>>,
): CalendarDay {
    const out: CalendarDay = { date, layers: {}, toActOn: 0 };
    for (const [key, items] of Object.entries(layers) as [
        LayerKey,
        CalendarItem[],
    ][]) {
        const kinds: Record<string, number> = {};
        for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
        out.layers[key] = { count: items.length, kinds, items };
    }
    return out;
}

function rye(over: Partial<CalendarMonth> = {}): CalendarMonth {
    const filled = [
        day("2026-09-17", { orders: [order("1017", "2026-09-17", "10:15")] }),
        day("2026-09-19", {
            orders: [order("1021", "2026-09-19", "11:30", true)],
            collections: [
                {
                    id: "c1",
                    kind: "collection",
                    title: "Asha Rao",
                    subtitle: "Sourdough",
                    at: null,
                    link: { type: "subscription", id: "s1" },
                },
            ],
        }),
    ];
    return {
        month: "2026-09",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "2026-09-13T18:30:00.000Z",
        to: "2026-09-20T18:30:00.000Z",
        layers: ["orders", "collections"],
        totals: { orders: 2, collections: 1 },
        days: weekDates("2026-09-14").map(
            (date) =>
                filled.find((d) => d.date === date) ?? {
                    date,
                    layers: {},
                    toActOn: 0,
                },
        ),
        toActOn: [],
        unavailable: [],
        joinedAt: "2026-06-02",
        daysOff: [],
        hasStaff: false,
        ...over,
    };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", "/calendar?view=week");
    push.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(data: CalendarMonth, day?: string) {
    act(() => {
        root.render(
            <BusinessWeek
                data={data}
                today="2026-09-18"
                thisMonth="2026-09"
                can={{ order: true, book: false, remind: false }}
                day={day}
            />,
        );
    });
}

const column = (date: string) =>
    host.querySelector<HTMLElement>(`#calendar-week [data-day="${date}"]`)
        ?.parentElement ?? null;
const link = (label: string) =>
    host.querySelector<HTMLAnchorElement>(`a[aria-label="${label}"]`);

describe("BusinessWeek: the Week as card columns (E25)", () => {
    it("titles the week and lists a day's things by time, each opening its record", () => {
        render(rye());
        expect(host.querySelector("h1")?.textContent).toBe("14–20 Sep 2026");
        const sat = column("2026-09-19");
        const cards = Array.from(sat?.querySelectorAll("a") ?? []);
        expect(cards.map((a) => a.getAttribute("href"))).toEqual([
            "/commerce/orders/1021",
            "/billing/subscriptions/s1",
        ]);
        expect(cards[0].textContent).toContain("11:30");
        expect(cards[0].textContent).toContain("Late");
        expect(cards[1].textContent).toContain("Pick-ups");
        expect(sat?.textContent).toContain("1 late order");
    });

    it("steps by week and greys This week on this week", () => {
        render(rye());
        expect(link("Previous week")?.getAttribute("href")).toBe(
            "/calendar?view=week&day=2026-09-11",
        );
        expect(link("Next week")?.getAttribute("href")).toBe(
            "/calendar?view=week&day=2026-09-25",
        );
        const thisWeek = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "This week",
        );
        expect(thisWeek?.disabled).toBe(true);
        expect(thisWeek?.getAttribute("aria-current")).toBe("date");
    });

    it("shows no money to a role the API sent none", () => {
        render(rye());
        expect(column("2026-09-17")?.textContent).not.toContain("₹");
    });

    it("switches to the month of the day picked", () => {
        render(rye(), "2026-09-16");
        const radios = host.querySelectorAll<HTMLButtonElement>(
            '[role="radiogroup"][aria-label="View"] [role="radio"]',
        );
        expect(
            Array.from(radios).map((r) => [
                r.textContent,
                r.getAttribute("aria-checked"),
            ]),
        ).toEqual([
            ["Month", "false"],
            ["Week", "true"],
        ]);
        act(() => radios[0].click());
        expect(push).toHaveBeenCalledWith("/calendar?day=2026-09-16", {
            scroll: false,
        });
    });

    it("opens the day as a sheet from its header", () => {
        render(rye());
        const header = host.querySelector<HTMLButtonElement>(
            '#calendar-week [data-day="2026-09-19"]',
        );
        expect(header?.getAttribute("aria-haspopup")).toBe("dialog");
        act(() => header?.click());
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog?.textContent).toContain("Sat 19 Sep");
        expect(dialog?.textContent).toContain("Collects · Asha Rao");
    });

    it("says a week at the joined edge can't go back, and why", () => {
        const june = rye({
            days: weekDates("2026-06-01").map((date) => ({
                date,
                layers: {},
                toActOn: 0,
            })),
        });
        render(june);
        expect(host.querySelector("h1")?.textContent).toBe("1–7 Jun 2026");
        expect(link("Previous week")).toBeNull();
        expect(host.textContent).toContain(
            "Saroh has your data from June 2026",
        );
        // The day before joining is muted and can't be opened.
        expect(
            host.querySelector<HTMLButtonElement>(
                '#calendar-week [data-day="2026-06-01"]',
            )?.disabled,
        ).toBe(true);
    });
});
