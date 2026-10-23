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
vi.mock("@/lib/services/bookings-opens-actions", () => ({
    saveBookingsOpens: vi.fn((change: object) =>
        Promise.resolve({ ok: true, data: change }),
    ),
}));
vi.mock("../availability/add-person-dialog", () => ({
    AddPersonDialog: ({ open }: { open: boolean }) =>
        open ? <div role="dialog">Add someone</div> : null,
}));
vi.mock("@/components/bookings/quick-look/booking-quick-look", () => ({
    BookingQuickLook: ({ block }: { block: { key: string } | null }) =>
        block ? <div role="dialog">Quick look {block.key}</div> : null,
}));
vi.mock("@/components/bookings/free-time/new-booking-from-gap", () => ({
    NewBookingFromGap: ({
        target,
    }: {
        target: { free: readonly [number, number] } | null;
    }) => (target ? <div role="dialog">Book from {target.free[0]}</div> : null),
}));
vi.mock("@/components/bookings/free-time/open-hours-dialog", () => ({
    OpenHoursDialog: () => null,
}));

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
/** The "…" options, opened: the cancelled switch lives there (U2). */
const openOptions = () => {
    const more = host.querySelector<HTMLButtonElement>(
        'button[aria-label^="This day:"]',
    );
    if (!more) throw new Error("no options button");
    act(() => more.click());
};
const cancelledSwitch = () =>
    document.querySelector<HTMLButtonElement>(
        '[data-header-popover] button[role="switch"]',
    );
const summaryText = () =>
    host.querySelector('[data-calendar-header] [role="status"]')?.textContent;

describe("cancelled bookings", () => {
    const calendar = calendarOf([
        booking("b1", "Tariq Ali", 10, 60),
        booking("gone", "Meera Shah", 15, 60, { status: "CANCELLED" }),
    ]);

    it("stay off the diary by default; the summary line says the rest", () => {
        draw(calendar);
        expect(blocks("one")).toHaveLength(1);
        expect(blocks("cancelled")).toHaveLength(0);
        // 9 to 10 and 11 to 5 are free; 3 to 4 is free again once cancelled.
        expect(summaryText()).toBe("1 booked · 2 free times · ₹500 booked");
        openOptions();
        const sw = cancelledSwitch();
        expect(sw?.getAttribute("aria-checked")).toBe("false");
        expect(sw?.getAttribute("aria-label")).toBe("Show cancelled bookings");
        expect(document.body.textContent).toContain("1 cancelled today");
    });

    it("draw as a thin line when switched on, and the address remembers", () => {
        draw(calendar);
        openOptions();
        act(() => cancelledSwitch()?.click());
        expect(cancelledSwitch()?.getAttribute("aria-checked")).toBe("true");
        const line = blocks("cancelled");
        expect(line).toHaveLength(1);
        expect(line[0]?.textContent).toContain("Meera Shah");
        expect(summaryText()).toContain("· 1 cancelled shown");
        expect(window.location.search).toBe(
            `?date=${DAY}&layout=day&person=all&cancelled=1`,
        );
        // The next day keeps it on.
        expect(
            host
                .querySelector('a[aria-label="Next day"]')
                ?.getAttribute("href"),
        ).toBe("/bookings?date=2026-09-30&layout=day&person=all&cancelled=1");

        act(() => cancelledSwitch()?.click());
        expect(blocks("cancelled")).toHaveLength(0);
        expect(window.location.search).toBe(
            `?date=${DAY}&layout=day&person=all`,
        );
    });

    it("are drawn from the start when the address asks", () => {
        draw(calendar, { showCancelled: true });
        expect(blocks("cancelled")).toHaveLength(1);
        openOptions();
        expect(cancelledSwitch()?.getAttribute("aria-checked")).toBe("true");
    });

    it("still open the quick look from their line", () => {
        draw(calendar, { showCancelled: true });
        act(() => (blocks("cancelled")[0] as HTMLElement).click());
        expect(host.textContent).toContain("Quick look gone");
    });

    it("a day with none still offers the switch, and says so", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        openOptions();
        expect(cancelledSwitch()).not.toBeNull();
        expect(document.body.textContent).toContain("None cancelled today");
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

    it("says Free and + Book at rest, and the time it would book under the pointer", () => {
        draw(calendarOf([]));
        const el = gap();
        expect(el.textContent).toContain("Free · 9:00 am to 5:00 pm");
        const book = el.querySelector("[data-free-book]");
        expect(book?.textContent).toBe("Book");
        // 100 minutes into the gap: 10:40, so the quarter hour at 10:45.
        fire(el, "pointermove", { clientY: 100 });
        expect(book?.textContent).toBe("Book 10:45 am");
        fire(el, "pointerout", { relatedTarget: document.body });
        expect(book?.textContent).toBe("Book");
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

describe("the colours", () => {
    it("are no longer a row above the diary: the … sheet says what they mean", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        expect(host.querySelector('ul[aria-label="Key"]')).toBeNull();
        openOptions();
        const sheet = document.querySelector("[data-header-popover]");
        expect(sheet?.textContent).toContain("What the colours mean");
        for (const name of [
            "A booking for one person",
            "A group class",
            "Free time",
            "Closed",
            "Time off",
            "Now",
        ]) {
            expect(sheet?.textContent).toContain(name);
        }
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
        openOptions();
        act(() => cancelledSwitch()?.click());
        expect(heads()).toEqual(["asha", "unassigned"]);
    });
});

describe("header C", () => {
    it("has the date as the page's heading, and no visible view switch", () => {
        draw(calendarOf([booking("b1", "Tariq Ali", 10, 60)]));
        expect(host.querySelectorAll("h1")).toHaveLength(1);
        expect(host.querySelector("h1")?.textContent).toBe("Tue 29 Sep");
        expect(host.querySelectorAll("[data-segmented]")).toHaveLength(0);
        // No standing sentence under the diary.
        expect(host.textContent).not.toContain("Customers can book");
    });

    it("says Today on today, and the arrows go a day back or on", () => {
        draw(calendarOf([]), { date: "2026-09-30" });
        expect(host.querySelector("h1")?.textContent).toBe("Today, Wed 30 Sep");
        expect(
            host
                .querySelector('a[aria-label="Previous day"]')
                ?.getAttribute("href"),
        ).toBe("/bookings?date=2026-09-29&layout=day&person=all");
    });

    it("has no chip with one person on the diary", () => {
        draw(calendarOf([]));
        expect(
            host.querySelector('button[aria-label^="Whose bookings"]'),
        ).toBeNull();
    });
});

describe("whose bookings", () => {
    const arjun = {
        ...asha,
        id: "arjun",
        name: "Arjun Rao",
        title: "Sports therapist",
    } as unknown as StaffView;
    const two: BookingsCalendar = {
        ...calendarOf([booking("b1", "Tariq Ali", 10, 60)]),
        diaries: [
            {
                person: { id: "asha", name: "Asha Rao", title: "Stylist" },
                bookings: [booking("b1", "Tariq Ali", 10, 60)],
                classes: [],
            },
            {
                person: { id: "arjun", name: "Arjun Rao", title: null },
                bookings: [
                    booking("a1", "Isha Joshi", 11, 30, {
                        staff: { id: "arjun", name: "Arjun Rao" },
                    }),
                    booking("a2", "Farah Khan", 14, 30, {
                        staff: { id: "arjun", name: "Arjun Rao" },
                    }),
                ],
                classes: [],
            },
        ],
    };
    const heads = () =>
        Array.from(host.querySelectorAll("[data-diary-column]")).map((c) =>
            c.getAttribute("data-diary-column"),
        );

    it("Everyone draws a column each; the chip names who is shown", () => {
        draw(two, { staff: [asha, arjun] });
        expect(heads()).toEqual(["asha", "arjun"]);
        expect(
            host
                .querySelector('button[aria-label^="Whose bookings"]')
                ?.getAttribute("aria-label"),
        ).toBe("Whose bookings: Everyone. Change");
        expect(summaryText()).toMatch(/^3 booked/);
    });

    it("one person draws their column, and the count matches theirs", () => {
        draw(two, { staff: [asha, arjun], person: "arjun" });
        expect(heads()).toEqual(["arjun"]);
        expect(summaryText()).toMatch(/^2 booked/);
        expect(
            host
                .querySelector('button[aria-label^="Whose bookings"]')
                ?.getAttribute("aria-label"),
        ).toBe("Whose bookings: Arjun Rao. Change");
    });

    it("picking someone in the sheet goes to them, with their count", () => {
        draw(two, { staff: [asha, arjun] });
        act(() =>
            host
                .querySelector<HTMLButtonElement>(
                    'button[aria-label^="Whose bookings"]',
                )
                ?.click(),
        );
        const rows = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '[data-header-popover] [role="radiogroup"][aria-label="Whose bookings"] [role="radio"]',
            ),
        );
        expect(rows.map((r) => r.textContent)).toEqual([
            expect.stringContaining("Everyone"),
            expect.stringContaining("Asha Rao"),
            expect.stringContaining("Arjun Rao"),
        ]);
        expect(rows[2]?.textContent).toContain("2bookings today");
        act(() => rows[2]?.click());
        expect(push).toHaveBeenCalledWith(
            `/bookings?date=${DAY}&layout=day&person=arjun`,
            { scroll: false },
        );
    });

    it("someone not on the diary in the address reads as Everyone", () => {
        draw(two, { staff: [asha, arjun], person: "gone" });
        expect(heads()).toEqual(["asha", "arjun"]);
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

    it("says how the column works above it, with Add who takes bookings", () => {
        draw(empty, { staff: [], serviceHours: own });
        const note = host.querySelector("[data-service-hours-note]");
        expect(note?.textContent).toContain(
            "Nobody takes bookings yet, so customers book each service in its own hours.",
        );
        const add = Array.from(note?.querySelectorAll("button") ?? []).find(
            (b) => b.textContent === "Add who takes bookings",
        );
        expect(add).toBeTruthy();
        act(() => add?.click());
        expect(host.textContent).toContain("Add someone");
    });
});
