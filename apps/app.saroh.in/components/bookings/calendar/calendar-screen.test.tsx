// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { StaffView } from "@/lib/staff/types";

import { CalendarScreen } from "./calendar-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn() }),
}));
// Server actions and the dialogs that call them: not what is tested here.
vi.mock("@/lib/services/actions", () => ({
    cancelBooking: vi.fn(),
    recordBookingOutcome: vi.fn(),
    rescheduleBooking: vi.fn(),
    listAvailability: vi.fn(() => Promise.resolve([])),
    readBookingPerson: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../availability/add-person-dialog", () => ({
    AddPersonDialog: ({ open }: { open: boolean }) =>
        open ? <div role="dialog">Add someone</div> : null,
}));
vi.mock("./booking-quick-look", () => ({
    BookingQuickLook: ({ block }: { block: { key: string } | null }) =>
        block ? <div role="dialog">Quick look {block.key}</div> : null,
}));
vi.mock("./new-booking-from-gap", () => ({
    NewBookingFromGap: ({
        target,
    }: {
        target: { free: readonly [number, number] } | null;
    }) => (target ? <div role="dialog">Book from {target.free[0]}</div> : null),
}));
vi.mock("./open-hours-dialog", () => ({ OpenHoursDialog: () => null }));

/**
 * The calendar as a screen: the one toolbar row, cancelled bookings off the
 * diary until the count's switch asks for them (and the address remembering
 * it), a legend that follows what is drawn, hours trimmed to the day, and
 * the Unassigned column only when something is unassigned.
 */

const IST = "Asia/Kolkata";
const DAY = "2026-09-29"; // a Tuesday

/** A booking on the day at a local hour, in India. */
const booking = (
    id: string,
    name: string,
    hour: number,
    minutes: number,
    extra: Partial<DiaryBooking> = {},
): DiaryBooking => {
    const start = Date.parse(`${DAY}T00:00:00+05:30`) + hour * 3_600_000;
    return {
        id,
        serviceId: "svc",
        startAt: new Date(start).toISOString(),
        endAt: new Date(start + minutes * 60_000).toISOString(),
        timezone: IST,
        status: "CONFIRMED",
        outcome: null,
        bookerName: name,
        bookerEmail: null,
        bookerPhone: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc",
            name: "Haircut",
            timezone: IST,
            capacity: 1,
            durationMinutes: minutes,
            priceCents: 50_000,
            currency: "INR",
        },
        contact: null,
        staff: { id: "asha", name: "Asha Rao" },
        paidWith: "PAID",
        packName: null,
        subscriptionId: null,
        ...extra,
    };
};

/** Asha, 9 to 5 on Tuesdays. */
const asha = {
    id: "asha",
    name: "Asha Rao",
    title: "Stylist",
    status: "ACTIVE",
    paused: false,
    serviceIds: ["svc"],
    hours: [{ dayOfWeek: 2, startMinute: 540, endMinute: 1020 }],
    extraHours: [],
    timeOff: [],
} as unknown as StaffView;

const calendarOf = (
    mine: DiaryBooking[],
    unassigned: DiaryBooking[] = [],
): BookingsCalendar => ({
    from: "",
    to: "",
    timezone: IST,
    money: true,
    diaries: [
        {
            person: { id: "asha", name: "Asha Rao", title: "Stylist" },
            bookings: mine,
            classes: [],
        },
        { person: null, bookings: unassigned, classes: [] },
    ],
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState(null, "", `/bookings?date=${DAY}`);
    window.localStorage.clear();
    push.mockClear();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(
    calendar: BookingsCalendar,
    over: Partial<Parameters<typeof CalendarScreen>[0]> = {},
) {
    act(() => {
        root.render(
            <CalendarScreen
                layout="day"
                date={DAY}
                today="2026-09-30"
                now={Date.parse("2026-09-30T06:00:00Z")}
                timezone={IST}
                calendar={calendar}
                staff={[asha]}
                services={[]}
                rules={null}
                people={{ canSearch: false, payLink: false }}
                can={{ book: true, hours: true }}
                newBooking={<button type="button">New booking</button>}
                {...over}
            />,
        );
    });
}

const blocks = (kind: string) =>
    Array.from(host.querySelectorAll(`[data-diary-block="${kind}"]`));
const hourMarks = () =>
    Array.from(host.querySelectorAll("[aria-hidden] > div > span")).map(
        (s) => s.textContent,
    );
const cancelledSwitch = () =>
    host.querySelector<HTMLButtonElement>('button[role="switch"]');

describe("cancelled bookings", () => {
    const calendar = calendarOf([
        booking("b1", "Tariq Ali", 10, 60),
        booking("gone", "Meera Shah", 15, 60, { status: "CANCELLED" }),
    ]);

    it("stay off the diary by default, counted beside the day's count", () => {
        draw(calendar);
        expect(blocks("one")).toHaveLength(1);
        expect(blocks("cancelled")).toHaveLength(0);
        expect(host.querySelector('[role="status"]')?.textContent).toBe(
            "1 booking · ₹500 booked",
        );
        const sw = cancelledSwitch();
        expect(sw?.getAttribute("aria-checked")).toBe("false");
        // Named for what it does; the words beside it take the press too.
        expect(sw?.getAttribute("aria-label")).toBe("Show 1 cancelled");
        expect(host.querySelector(`label[for="${sw?.id}"]`)?.textContent).toBe(
            "1 cancelled",
        );
    });

    it("draw as a thin line when switched on, and the address remembers", () => {
        draw(calendar);
        act(() => cancelledSwitch()?.click());
        expect(cancelledSwitch()?.getAttribute("aria-checked")).toBe("true");
        const line = blocks("cancelled");
        expect(line).toHaveLength(1);
        expect(line[0]?.textContent).toContain("Meera Shah");
        expect(window.location.search).toBe(`?date=${DAY}&cancelled=1`);
        // The next day and the other layouts keep it on.
        expect(
            host
                .querySelector('a[aria-label="Next day"]')
                ?.getAttribute("href"),
        ).toBe("/bookings?date=2026-09-30&cancelled=1");
        expect(
            Array.from(host.querySelectorAll("nav[data-segmented] a")).map(
                (a) => a.getAttribute("href"),
            ),
        ).toContain(`/bookings?date=${DAY}&layout=week&cancelled=1`);

        act(() => cancelledSwitch()?.click());
        expect(blocks("cancelled")).toHaveLength(0);
        expect(window.location.search).toBe(`?date=${DAY}`);
    });

    it("are drawn from the start when the address asks", () => {
        draw(calendar, { showCancelled: true });
        expect(cancelledSwitch()?.getAttribute("aria-checked")).toBe("true");
        expect(blocks("cancelled")).toHaveLength(1);
    });

    it("still open the quick look from their line", () => {
        draw(calendar, { showCancelled: true });
        act(() => (blocks("cancelled")[0] as HTMLElement).click());
        expect(host.textContent).toContain("Quick look gone");
    });

    it("offer no switch on a day with none", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        expect(cancelledSwitch()).toBeNull();
    });
});

describe("a free gap", () => {
    /** The one gap of Asha's empty day, 9 am to 5 pm, measured at a px a minute. */
    const gap = () => {
        const el = host.querySelector<HTMLButtonElement>("[data-free-gap]");
        if (!el) throw new Error("no free gap drawn");
        el.getBoundingClientRect = () =>
            ({ top: 0, height: 480 }) as unknown as DOMRect;
        return el;
    };
    const fire = (el: Element, type: string, init: MouseEventInit) => {
        const e = new MouseEvent(type, { bubbles: true, ...init });
        Object.defineProperty(e, "pointerType", { value: "mouse" });
        act(() => {
            el.dispatchEvent(e);
        });
    };

    it("shows nothing at rest, and the time it would book under the pointer", () => {
        draw(calendarOf([]));
        const el = gap();
        const label = el.querySelector("span");
        expect(label?.className).toContain("hidden");
        // 100 minutes into the gap: 10:40, so the quarter hour at 10:45.
        fire(el, "pointermove", { clientY: 100 });
        expect(label?.textContent).toBe("Book 10:45 am");
        expect(label?.className).not.toContain("hidden");
        fire(el, "pointerout", { relatedTarget: document.body });
        expect(label?.className).toContain("hidden");
    });

    it("books at the nearest quarter hour to a click or a tap", () => {
        draw(calendarOf([]));
        fire(gap(), "click", { clientY: 100, detail: 1 });
        expect(host.textContent).toContain("Book from 645");
    });

    it("books from the start of the gap on the keyboard", () => {
        draw(calendarOf([]));
        fire(gap(), "click", { detail: 0 });
        expect(host.textContent).toContain("Book from 540");
    });
});

describe("the legend follows what is drawn", () => {
    const key = () =>
        Array.from(host.querySelectorAll('ul[aria-label="Key"] li')).map(
            (li) => li.textContent,
        );

    it("names closed time on a day with closed time, and never Free", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        expect(key()).toEqual(["Closed"]);
    });

    it("adds Cancelled only while cancelled bookings are drawn", () => {
        const calendar = calendarOf([
            booking("gone", "Meera Shah", 15, 60, { status: "CANCELLED" }),
        ]);
        draw(calendar);
        expect(key()).toEqual(["Closed"]);
        act(() => cancelledSwitch()?.click());
        expect(key()).toEqual(["Closed", "Cancelled"]);
    });

    it("is not drawn at all when only bookings are", () => {
        // The staff read failed: no hours are known, so nothing is hatched.
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]), {
            staff: null,
        });
        expect(host.querySelector('ul[aria-label="Key"]')).toBeNull();
    });
});

describe("the hours shown", () => {
    it("run from an hour before opening to an hour after closing", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        const marks = hourMarks();
        expect(marks.at(0)).toBe("8 am");
        expect(marks.at(-1)).toBe("5 pm");
    });

    it("widen to take in a booking outside the hours", () => {
        draw(calendarOf([booking("late", "Tariq Ali", 20, 60)]));
        const marks = hourMarks();
        expect(marks.at(0)).toBe("8 am");
        expect(marks.at(-1)).toBe("8 pm");
        expect(blocks("one")).toHaveLength(1);
    });
});

describe("the Unassigned column", () => {
    const heads = () =>
        Array.from(host.querySelectorAll("[data-diary-column]")).map((c) =>
            c.getAttribute("data-diary-column"),
        );

    it("is drawn only when the day has an unassigned booking", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        expect(heads()).toEqual(["asha"]);

        draw(
            calendarOf(
                [booking("b1", "Tariq Ali", 10, 60)],
                [booking("u1", "Walk In", 11, 30, { staff: null })],
            ),
        );
        expect(heads()).toEqual(["asha", "unassigned"]);
        expect(host.textContent).toContain("Unassigned");
    });

    it("is not drawn for a cancelled booking that is not shown", () => {
        const calendar = calendarOf(
            [],
            [
                booking("u1", "Walk In", 11, 30, {
                    staff: null,
                    status: "CANCELLED",
                }),
            ],
        );
        draw(calendar);
        expect(heads()).toEqual(["asha"]);
        act(() => cancelledSwitch()?.click());
        expect(heads()).toEqual(["asha", "unassigned"]);
    });
});

describe("the toolbar is one row", () => {
    it("has the date as the page's heading and one view switch", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        expect(host.querySelectorAll("h1")).toHaveLength(1);
        expect(host.querySelector("h1")?.textContent).toBe("Tue 29 Sep");
        expect(host.querySelectorAll("[data-segmented]")).toHaveLength(1);
        expect(
            Array.from(host.querySelectorAll("nav[data-segmented] a")).map(
                (a) => a.getAttribute("href"),
            ),
        ).toEqual([
            `/bookings?date=${DAY}`,
            `/bookings?date=${DAY}&layout=week`,
            `/bookings?date=${DAY}&layout=agenda`,
            "/bookings/all",
        ]);
        // No standing sentence under the diary.
        expect(host.textContent).not.toContain("Customers can book");
    });

    it("offers Today only on another day, after back and forward", () => {
        draw(calendarOf([]));
        const lead = host.querySelector('[data-slot="page-lead"]');
        expect(
            Array.from(lead?.querySelectorAll("a") ?? []).map(
                (a) => a.getAttribute("aria-label") ?? a.textContent,
            ),
        ).toEqual(["Previous day", "Next day", "Today"]);

        draw(calendarOf([]), { date: "2026-09-30" });
        expect(host.querySelector("h1")?.textContent).toBe(
            "Wed 30 Sep · today",
        );
        expect(lead?.textContent).not.toContain("Today");
    });
});

describe("with nobody on the diary", () => {
    const empty: BookingsCalendar = { ...calendarOf([]), diaries: [] };
    const own = {
        hours: [{ dayOfWeek: 2, startMinute: 600, endMinute: 1080 }],
        timeOff: [],
    } as unknown as NonNullable<
        Parameters<typeof CalendarScreen>[0]["serviceHours"]
    >;

    it("says how the column works once, and Got it puts it away for good", () => {
        draw(empty, { staff: [], serviceHours: own });
        expect(host.textContent).toContain(
            "Customers book each service in its own hours.",
        );
        const gotIt = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Got it",
        );
        act(() => gotIt?.click());
        expect(host.textContent).not.toContain(
            "Customers book each service in its own hours.",
        );
        expect(
            window.localStorage.getItem("saroh:bookings:service-hours-hint"),
        ).toBe("1");
        // The action is still at the head of the column.
        const add = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Add who takes bookings",
        );
        expect(add).toBeTruthy();
        act(() => add?.click());
        expect(host.textContent).toContain("Add someone");
    });
});
