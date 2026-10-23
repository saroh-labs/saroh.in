// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { StaffView } from "@/lib/staff/types";

import { CalendarScreen } from "./calendar-screen";
import { resetFirstDayHelp } from "./day-states";
import { BookingsLocked } from "./parts";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn() }),
}));
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
        target: {
            staff: { name: string };
            free: readonly [number, number];
        } | null;
    }) =>
        target ? (
            <div role="dialog">
                Book {target.staff.name} from {target.free[0]}
            </div>
        ) : null,
}));
vi.mock("@/components/bookings/free-time/open-hours-dialog", () => ({
    OpenHoursDialog: ({
        target,
    }: {
        target: { staff: { name: string }; from: number } | null;
    }) =>
        target ? (
            <div role="dialog">
                Open {target.staff.name} from {target.from}
            </div>
        ) : null,
}));

/**
 * The Day calendar's states as a screen (U4, #1020): the first day and its
 * help, nobody taking bookings yet, Calendar only, a Member at the front
 * desk, Everyone on a phone, a Reviewer locked out, and the presses: a free
 * time opens the free-time sheet with the person and time, closed time
 * opens those hours, from a pointer or the keyboard.
 */

const IST = "Asia/Kolkata";
const DAY = "2026-09-29"; // a Tuesday

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
            name: "Physio assessment",
            timezone: IST,
            capacity: 1,
            durationMinutes: minutes,
            priceCents: 50_000,
            currency: "INR",
        },
        contact: null,
        staff: { id: "meera", name: "Meera Iyer" },
        paidWith: "PAID",
        packName: null,
        subscriptionId: null,
        ...extra,
    };
};

/** Meera, 9 to 5 on Tuesdays. */
const meera = {
    id: "meera",
    name: "Meera Iyer",
    title: "Physiotherapist",
    status: "ACTIVE",
    paused: false,
    serviceIds: ["svc"],
    hours: [{ dayOfWeek: 2, startMinute: 540, endMinute: 1020 }],
    extraHours: [],
    timeOff: [],
} as unknown as StaffView;
const arjun = {
    ...meera,
    id: "arjun",
    name: "Arjun Rao",
    title: "Sports therapist",
} as unknown as StaffView;

const calendarOf = (
    mine: DiaryBooking[],
    his: DiaryBooking[] = [],
): BookingsCalendar => ({
    from: "",
    to: "",
    timezone: IST,
    money: true,
    diaries: [
        {
            person: { id: "meera", name: "Meera Iyer", title: null },
            bookings: mine,
            classes: [],
        },
        {
            person: { id: "arjun", name: "Arjun Rao", title: null },
            bookings: his,
            classes: [],
        },
    ],
});
const nothing = calendarOf([]);
const busy = calendarOf([booking("b1", "Ananya Desai", 10, 45)]);

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
    resetFirstDayHelp();
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
                staff={[meera]}
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

const buttonNamed = (name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === name,
    );
const freeGaps = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("[data-free-gap]"));
const closedTimes = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("[data-closed-time]"));
const press = (el: Element, init: MouseEventInit) =>
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
    });

describe("the first day", () => {
    it("says whose day is open, the three things to know, and where their hours are", () => {
        draw(nothing);
        const card = host.querySelector("[data-first-day]");
        expect(card?.querySelector("h2")?.textContent).toBe(
            "Meera's day is open",
        );
        expect(card?.querySelectorAll("li")).toHaveLength(3);
        expect(card?.textContent).toContain("green free time");
        const change = card?.querySelector("a");
        expect(change?.textContent).toBe("Change Meera's hours");
        expect(change?.getAttribute("href")).toBe("/bookings/availability");
        // A phone has its own card, over the calendar, saying tap.
        expect(
            host.querySelector("[data-first-day-phone]")?.textContent,
        ).toContain("Tap a green free time");
        // And the line under the day explains the green.
        expect(host.textContent).toContain(
            "Free times show in green, so you can see at a glance where a booking fits.",
        );
    });

    it("goes for good with Got it, for this viewer", () => {
        draw(nothing);
        act(() => buttonNamed("Got it")?.click());
        expect(host.querySelector("[data-first-day]")).toBeNull();
        expect(host.querySelector("[data-first-day-phone]")).toBeNull();
        expect(
            window.localStorage.getItem("saroh:bookings:first-day-help"),
        ).toBe("1");
        draw(nothing, { date: "2026-10-06" });
        expect(host.querySelector("[data-first-day]")).toBeNull();
    });

    it("names the person picked, and links to their own hours", () => {
        draw(nothing, { staff: [meera, arjun], person: "arjun" });
        const card = host.querySelector("[data-first-day]");
        expect(card?.querySelector("h2")?.textContent).toBe(
            "Arjun's day is open",
        );
        expect(card?.querySelector("a")?.getAttribute("href")).toBe(
            "/bookings/availability?person=arjun",
        );
    });

    it("is not shown once anything is booked, or to someone who can't book", () => {
        draw(busy);
        expect(host.querySelector("[data-first-day]")).toBeNull();
        expect(host.textContent).toContain(
            "Swipe the calendar left or right to change day.",
        );
        draw(nothing, { can: { book: false, hours: false } });
        expect(host.querySelector("[data-first-day]")).toBeNull();
    });

    it("leaves out Change hours for someone who can't change them", () => {
        draw(nothing, { can: { book: true, hours: false } });
        expect(host.querySelector("[data-first-day] a")).toBeNull();
        expect(buttonNamed("Got it")).toBeTruthy();
    });
});

describe("nobody takes bookings yet", () => {
    const empty: BookingsCalendar = { ...nothing, diaries: [] };

    it("asks who takes bookings, with the one next step", () => {
        draw(empty, { staff: [] });
        const state = host.querySelector("[data-nobody-yet]");
        expect(state?.querySelector("h2")?.textContent).toBe(
            "Who takes bookings?",
        );
        expect(host.querySelector("[data-day-grid]")).toBeNull();
        act(() => buttonNamed("Add who takes bookings")?.click());
        expect(host.textContent).toContain("Add someone");
        // A phone also offers the services' own hours.
        expect(state?.querySelector('a[href="/services"]')?.textContent).toBe(
            "Or give each service its own hours",
        );
    });

    it("has no Add for someone who can't add people (a Member)", () => {
        draw(empty, {
            staff: [],
            can: { book: true, hours: true, addPeople: false },
        });
        expect(host.querySelector("[data-nobody-yet]")).not.toBeNull();
        expect(buttonNamed("Add who takes bookings")).toBeUndefined();
    });
});

describe("Calendar only", () => {
    it("sees the bookings, no Free to book, closed time only Closed, and why in one line", () => {
        draw(busy, {
            can: { book: false, hours: false },
            newBooking: null,
        });
        expect(host.querySelectorAll('[data-diary-block="one"]')).toHaveLength(
            1,
        );
        expect(freeGaps()).toHaveLength(0);
        expect(closedTimes()).toHaveLength(0);
        expect(buttonNamed("New booking")).toBeUndefined();
        expect(host.textContent).toContain(
            "Your role sees the calendar only, so you can't book or change bookings.",
        );
    });
});

describe("a Member at the front desk (DEC-170)", () => {
    const member = { book: true, hours: true, addPeople: false };

    it("books from a free time: the sheet opens with the person and time set", () => {
        draw(busy, { can: member });
        const first = freeGaps()[0];
        expect(first.getAttribute("aria-label")).toBe(
            "Free 9:00 to 10:00 am with Meera Iyer. Book or block",
        );
        press(first, { detail: 0 });
        expect(host.textContent).toContain("Book Meera Iyer from 540");
    });

    it("opens closed time, from the keyboard at the hour before opening", () => {
        draw(busy, { can: member });
        const [morning, evening] = closedTimes() as [
            HTMLButtonElement,
            HTMLButtonElement,
        ];
        press(morning, { detail: 0 });
        expect(host.textContent).toContain("Open Meera Iyer from 480");
        press(evening, { detail: 0 });
        expect(host.textContent).toContain("Open Meera Iyer from 1020");
    });

    it("opens closed time at the half hour under a pointer", () => {
        draw(busy, { can: member });
        const evening = closedTimes()[1];
        // 5 to 6 pm drawn 60px tall: 40px down is 5:40, so 5:30.
        evening.getBoundingClientRect = () =>
            ({ top: 0, height: 60 }) as unknown as DOMRect;
        press(evening, { detail: 1, clientY: 40 });
        expect(host.textContent).toContain("Open Meera Iyer from 1050");
    });
});

describe("a booking", () => {
    it("opens its quick look on a press, and is a button the keyboard reaches", () => {
        draw(busy);
        const block = host.querySelector<HTMLButtonElement>(
            '[data-diary-block="one"]',
        );
        expect(block?.tagName).toBe("BUTTON");
        expect(block?.getAttribute("aria-label")).toContain("Ananya Desai");
        act(() => block?.click());
        expect(host.textContent).toContain("Quick look b1");
    });
});

describe("Everyone", () => {
    const both = calendarOf(
        [booking("b1", "Ananya Desai", 10, 45)],
        [
            booking("a1", "Vikram Nair", 10, 60, {
                staff: { id: "arjun", name: "Arjun Rao" },
            }),
        ],
    );

    it("is a column a person on the desk, and one list on a phone", () => {
        draw(both, { staff: [meera, arjun] });
        expect(
            Array.from(host.querySelectorAll("[data-diary-column]")).map((c) =>
                c.getAttribute("data-diary-column"),
            ),
        ).toEqual(["meera", "arjun"]);
        const phone = host.querySelector("[data-everyone-column]");
        expect(phone?.textContent).toContain("Ananya Desai · Meera");
        expect(phone?.textContent).toContain("Vikram Nair · Arjun");
        // The desk's column heads count each person's day.
        const heads = Array.from(
            host.querySelectorAll("[data-column-head]"),
        ).map((h) => h.textContent);
        expect(heads[0]).toContain("1 booked");
        expect(heads[1]).toContain("Sports therapist · 9 am to 5 pm");
    });

    it("one person picked is their own day at both sizes", () => {
        draw(both, { staff: [meera, arjun], person: "meera" });
        expect(host.querySelector("[data-everyone-column]")).toBeNull();
        expect(host.querySelectorAll("[data-diary-column]").length).toBe(1);
    });
});

describe("a Reviewer", () => {
    it("can't open Bookings, and is told why with the way back", () => {
        const html = renderToStaticMarkup(
            <BookingsLocked business="Kaya Physio" role="Reviewer" />,
        );
        expect(html).toContain("Bookings");
        expect(html).toContain("Reviewer");
        expect(html).toContain("Back to Home");
    });
});
