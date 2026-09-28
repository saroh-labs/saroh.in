// @vitest-environment jsdom
/**
 * The calendar's days off and team filter (plan 005 E24) on the screen, on a
 * month shaped like Kavi Dental's (E29): two dentists, Dr. Pillai off on the
 * 23rd. Picking him hides Dr. Rao's booking and stripes his day off; a
 * business with no team gets no filter.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
} from "@/lib/calendar/types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/calendar",
}));

import { BusinessCalendar } from "@/components/calendar/business-calendar";

const PILLAI = "st-pillai";
const RAO = "st-rao";

function booking(id: string, staffId: string, title: string): CalendarItem {
    return {
        id,
        kind: "confirmed",
        title,
        subtitle: "Asha Rao",
        at: "2026-09-22T04:30:00Z",
        link: { type: "booking", id },
        staffId,
        durationMinutes: 30,
    };
}

function days(): CalendarDay[] {
    return Array.from({ length: 30 }, (_, i) => {
        const date = `2026-09-${String(i + 1).padStart(2, "0")}`;
        const items =
            date === "2026-09-22"
                ? [
                      booking("b-p", PILLAI, "Root canal"),
                      booking("b-r", RAO, "Cleaning"),
                  ]
                : [];
        return {
            date,
            toActOn: 0,
            layers: items.length
                ? {
                      bookings: {
                          count: items.length,
                          kinds: { confirmed: items.length },
                          items,
                      },
                  }
                : {},
        };
    });
}

function kavi(over: Partial<CalendarMonth> = {}): CalendarMonth {
    return {
        month: "2026-09",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "",
        to: "",
        layers: ["bookings"],
        totals: { bookings: 2 },
        days: days(),
        toActOn: [],
        unavailable: [],
        joinedAt: "2026-06-01",
        daysOff: [
            {
                kind: "time_off",
                startAt: "2026-09-22T18:30:00Z",
                endAt: "2026-09-23T18:30:00Z",
                allDay: true,
                dates: ["2026-09-23"],
                staffId: PILLAI,
                name: "Dr. Arun Pillai",
                reason: "At a dental conference in Chennai",
            },
        ],
        hasStaff: true,
        staff: [
            { id: PILLAI, name: "Dr. Arun Pillai", title: "Dentist" },
            { id: RAO, name: "Dr. Meenakshi Rao", title: "Dentist" },
        ],
        ...over,
    };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.history.replaceState(null, "", "/calendar");
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

function render(data: CalendarMonth, team?: string) {
    act(() => {
        root.render(
            <BusinessCalendar
                data={data}
                today="2026-09-22"
                thisMonth="2026-09"
                can={{ order: false, book: false, remind: false }}
                team={team}
            />,
        );
    });
}

const filter = () =>
    host.querySelector<HTMLSelectElement>('select[aria-label="Team member"]');
const cell = (date: string) =>
    host.querySelector<HTMLButtonElement>(`[data-day="${date}"]`);
const panel = () => host.querySelector("#calendar-day")?.textContent ?? "";

function choose(select: HTMLSelectElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

describe("BusinessCalendar: days off and the team filter (E24)", () => {
    it("lists Everyone and each dentist", () => {
        render(kavi());
        const options = Array.from(filter()?.options ?? []).map(
            (o) => o.textContent,
        );
        expect(options).toEqual([
            "Everyone",
            "Dr. Arun Pillai",
            "Dr. Meenakshi Rao",
        ]);
        expect(filter()?.value).toBe("");
    });

    it("says who is off on the day, unstriped for Everyone", () => {
        render(kavi());
        const the23rd = cell("2026-09-23");
        expect(the23rd?.textContent).toContain("Dr. Pillai off");
        expect(the23rd?.getAttribute("aria-label")).toContain(
            "Dr. Arun Pillai off",
        );
        expect(the23rd?.className).not.toContain("repeating-linear-gradient");
    });

    it("filtering to one dentist hides the other's bookings and stripes their day off", () => {
        render(kavi());
        expect(panel()).toContain("Cleaning");
        const select = filter();
        if (!select) throw new Error("No team filter");
        choose(select, PILLAI);

        expect(panel()).toContain("Root canal");
        expect(panel()).not.toContain("Cleaning");
        expect(cell("2026-09-22")?.textContent).toContain("1 booking");
        const the23rd = cell("2026-09-23");
        expect(the23rd?.textContent).toContain("Off");
        expect(the23rd?.className).toContain("repeating-linear-gradient");
        // The address keeps the person, without reading the month again.
        expect(window.location.search).toBe(`?team=${PILLAI}`);
        expect(push).not.toHaveBeenCalled();
        // A step to the next month keeps them.
        const next = host.querySelector<HTMLAnchorElement>(
            'a[aria-label="Next month"]',
        );
        expect(next?.getAttribute("href")).toBe(
            `/calendar?month=2026-10&team=${PILLAI}`,
        );
    });

    it("opens on the person the address names", () => {
        render(kavi(), RAO);
        expect(filter()?.value).toBe(RAO);
        expect(panel()).toContain("Cleaning");
        expect(panel()).not.toContain("Root canal");
        // Dr. Rao works the 23rd: nothing said, nothing striped.
        expect(cell("2026-09-23")?.textContent).not.toContain("Off");
    });

    it("says the day off in the day panel", () => {
        render(kavi());
        act(() => cell("2026-09-23")?.click());
        expect(panel()).toContain(
            "Dr. Arun Pillai off · At a dental conference in Chennai",
        );
    });

    it("switches to the week holding the day picked, keeping the person (E25)", () => {
        render(kavi(), PILLAI);
        act(() => cell("2026-09-23")?.click());
        const week = Array.from(
            host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
        ).find((r) => r.textContent === "Week");
        expect(week?.getAttribute("aria-checked")).toBe("false");
        act(() => week?.click());
        expect(push).toHaveBeenCalledWith(
            `/calendar?view=week&day=2026-09-23&team=${PILLAI}`,
            { scroll: false },
        );
    });

    it("shows no filter to a business with no staff", () => {
        render(kavi({ hasStaff: false, staff: [], daysOff: [] }));
        expect(filter()).toBeNull();
    });

    it("shows no filter to a viewer the team isn't named to", () => {
        render(kavi({ staff: undefined }));
        expect(filter()).toBeNull();
    });

    it("draws a closed day striped, whoever is picked", () => {
        render(
            kavi({
                daysOff: [
                    {
                        kind: "closure",
                        startAt: "2026-09-24T18:30:00Z",
                        endAt: "2026-09-25T18:30:00Z",
                        allDay: true,
                        dates: ["2026-09-25"],
                        reason: "Closed for a festival",
                    },
                ],
            }),
        );
        const the25th = cell("2026-09-25");
        expect(the25th?.textContent).toContain("Closed");
        expect(the25th?.getAttribute("aria-label")).toContain(
            "Closed · Closed for a festival",
        );
        expect(the25th?.className).toContain("repeating-linear-gradient");
    });
});
