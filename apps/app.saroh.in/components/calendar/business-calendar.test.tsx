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

/** What to show's button, and the overlay it opens (a popover on the desk). */
const whatToShow = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label^="What to show"]');
function openFilter() {
    act(() => whatToShow()?.click());
}
/** Whose: the people the overlay lists, or null when it lists none. */
const whose = () =>
    document.querySelector('[role="radiogroup"][aria-label="Whose"]');
const radios = () =>
    Array.from(
        whose()?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
const cell = (date: string) =>
    host.querySelector<HTMLButtonElement>(`[data-day="${date}"]`);
const panel = () => host.querySelector("#calendar-day")?.textContent ?? "";

function choose(name: string) {
    openFilter();
    const radio = radios().find((r) => r.textContent === name);
    if (!radio) throw new Error(`No ${name} in Whose`);
    act(() => radio.click());
}

describe("BusinessCalendar: days off and the team filter (E24)", () => {
    it("lists Everyone and each dentist under Whose", () => {
        render(kavi());
        expect(whatToShow()?.textContent).toBe("Everyone · bookings");
        openFilter();
        expect(radios().map((r) => r.textContent)).toEqual([
            "Everyone",
            "Dr. Arun Pillai",
            "Dr. Meenakshi Rao",
        ]);
        expect(
            radios().find((r) => r.getAttribute("aria-checked") === "true")
                ?.textContent,
        ).toBe("Everyone");
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
        choose("Dr. Arun Pillai");
        expect(whatToShow()?.textContent).toBe("Dr. Pillai · bookings");

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
        expect(whatToShow()?.textContent).toBe("Dr. Rao · bookings");
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
        expect(whatToShow()?.textContent).toBe("Bookings");
        openFilter();
        expect(whose()).toBeNull();
    });

    it("shows no filter to a viewer the team isn't named to", () => {
        render(kavi({ staff: undefined }));
        openFilter();
        expect(whose()).toBeNull();
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
