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
    AddPersonDialog: () => null,
}));
vi.mock("./booking-quick-look", () => ({
    BookingQuickLook: ({ block }: { block: { key: string } | null }) =>
        block ? <div role="dialog">Quick look {block.key}</div> : null,
}));
vi.mock("./new-booking-from-gap", () => ({
    NewBookingFromGap: ({
        target,
    }: {
        target: {
            staff: { name: string };
            date: string;
            free: readonly [number, number];
        } | null;
    }) =>
        target ? (
            <div role="dialog">
                Book {target.staff.name} on {target.date} from {target.free[0]}
            </div>
        ) : null,
}));
vi.mock("./open-hours-dialog", () => ({
    OpenHoursDialog: ({
        target,
    }: {
        target: { staff: { name: string }; date: string; from: number } | null;
    }) =>
        target ? (
            <div role="dialog">
                Open hours {target.staff.name} on {target.date} from{" "}
                {target.from}
            </div>
        ) : null,
}));

/**
 * The Week (U5, #1021), at both sizes. The desk draws BKDCalendarWeek: a
 * count and a fullness bar on each day heading, a lane per person on
 * Everyone, free time to book, and "Closed on Sundays · Open hours on this
 * day". The phone draws BKMBookingsWeek: the Monday-to-Sunday strip over
 * the picked day's list, whose count agrees with the strip. Both trees are
 * in the page and CSS shows one, so each test reads its own.
 */

const IST = "Asia/Kolkata";
const MON = "2026-10-19";
const WED = "2026-10-21";
const SUN = "2026-10-25";

const MEERA = { id: "meera", name: "Meera Iyer" };
const ARJUN = { id: "arjun", name: "Arjun Rao" };

/** A booking on a day at a local hour and minute, in India. */
const booking = (
    id: string,
    name: string,
    day: string,
    at: [number, number],
    minutes: number,
    staff: { id: string; name: string },
    extra: Partial<DiaryBooking> = {},
): DiaryBooking => {
    const start =
        Date.parse(`${day}T00:00:00+05:30`) +
        at[0] * 3_600_000 +
        at[1] * 60_000;
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
        createdAt: "2026-10-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc",
            name: "Physio assessment",
            timezone: IST,
            capacity: 1,
            durationMinutes: minutes,
            priceCents: 100_000,
            currency: "INR",
        },
        contact: null,
        staff,
        paidWith: "PAID",
        packName: null,
        subscriptionId: null,
        ...extra,
    };
};

/** Monday to Saturday, nobody on Sundays. */
const person = (
    p: { id: string; name: string },
    title: string,
    hours: [number, number][],
): StaffView =>
    ({
        ...p,
        title,
        status: "ACTIVE",
        paused: false,
        serviceIds: ["svc"],
        hours: [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) =>
            hours.map(([startMinute, endMinute]) => ({
                dayOfWeek,
                startMinute,
                endMinute,
            })),
        ),
        extraHours: [],
        timeOff: [],
    }) as unknown as StaffView;

// Meera 9 to 1 and 3 to 7; Arjun 10 to 6.
const meera = person(MEERA, "Physiotherapist", [
    [540, 780],
    [900, 1140],
]);
const arjun = person(ARJUN, "Sports therapist", [[600, 1080]]);

const theWeek = [
    booking("ananya", "Ananya Desai", MON, [9, 0], 45, MEERA),
    booking("kabir", "Kabir Singh", MON, [11, 30], 45, MEERA),
    booking("vikram", "Vikram Nair", MON, [10, 0], 60, ARJUN),
    booking("sana", "Sana Qureshi", WED, [10, 0], 45, MEERA),
];

const calendarOf = (all: DiaryBooking[]): BookingsCalendar => ({
    from: `${MON}T00:00:00+05:30`,
    to: `2026-10-26T00:00:00+05:30`,
    timezone: IST,
    money: true,
    diaries: [MEERA, ARJUN].map((p) => ({
        person: { ...p, title: null },
        bookings: all.filter((b) => b.staff?.id === p.id),
        classes: [],
    })),
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
    window.history.replaceState(null, "", `/bookings?date=${MON}`);
    window.localStorage.clear();
    push.mockClear();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(over: Partial<Parameters<typeof CalendarScreen>[0]> = {}) {
    act(() => {
        root.render(
            <CalendarScreen
                layout="week"
                date={MON}
                today={MON}
                now={Date.parse(`${MON}T06:00:00Z`)}
                timezone={IST}
                calendar={calendarOf(theWeek)}
                staff={[meera, arjun]}
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

const desk = () => {
    const el = host.querySelector<HTMLElement>('[data-week-view="desk"]');
    if (!el) throw new Error("no desk week");
    return el;
};
const phone = () => {
    const el = host.querySelector<HTMLElement>('[data-week-view="phone"]');
    if (!el) throw new Error("no phone week");
    return el;
};
const heading = (label: string) => {
    const el = desk().querySelector<HTMLButtonElement>(
        `button[aria-label^="${label}"]`,
    );
    if (!el) throw new Error(`no heading ${label}`);
    return el;
};
const dayCell = (label: string) => {
    const el = phone().querySelector<HTMLButtonElement>(
        `[role="radio"][aria-label^="${label}"]`,
    );
    if (!el) throw new Error(`no day ${label}`);
    return el;
};
const byText = (scope: HTMLElement, text: string) =>
    Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent.trim() === text,
    );
const dialogText = () =>
    Array.from(document.querySelectorAll('[role="dialog"]'))
        .map((d) => d.textContent)
        .join(" | ");

describe("the week on the desk", () => {
    it("heads each day with its count and how full it is", () => {
        draw();
        const mon = heading("Mon 19 Oct");
        expect(mon.textContent).toContain("3 booked");
        expect(mon.getAttribute("aria-label")).toMatch(
            /^Mon 19 Oct, today, 3 booked, .+\. Open the day$/,
        );
        expect(heading("Wed 21 Oct").textContent).toContain("1 booked");
        expect(heading("Tue 20 Oct").textContent).toContain("0 booked");
        const full = (label: string) =>
            Number(
                heading(label)
                    .querySelector("[data-fullness]")
                    ?.getAttribute("data-fullness"),
            );
        // Monday is fuller than Wednesday, and Tuesday is empty.
        expect(full("Mon 19 Oct")).toBeGreaterThan(full("Wed 21 Oct"));
        expect(full("Wed 21 Oct")).toBeGreaterThan(0);
        expect(full("Tue 20 Oct")).toBe(0);
    });

    it("gives each person a lane on Everyone, the same all week", () => {
        draw();
        expect(desk().textContent).toContain(
            "Each day has a lane per person: Meera, Arjun.",
        );
        const block = (name: string) =>
            desk().querySelector<HTMLElement>(
                `[data-diary-block][aria-label*="${name}"]`,
            );
        // Meera's lane is the left half, Arjun's the right.
        expect(block("Ananya Desai")?.style.left).toBe("calc(0% + 2px)");
        expect(block("Vikram Nair")?.style.left).toBe("calc(50% + 2px)");
        expect(block("Sana Qureshi")?.style.left).toBe("calc(0% + 2px)");
        // Narrow lanes: the first name, the whole name is the label.
        expect(block("Ananya Desai")?.textContent).toBe("Ananya");
        // Free time in a lane says "Free" and books that person.
        const free = desk().querySelectorAll<HTMLButtonElement>(
            'button[data-week-free][aria-label*="Arjun Rao"]',
        );
        expect(free.length).toBeGreaterThan(0);
        expect(free.item(0).textContent).toBe("Free");
    });

    it("draws one person's week full width, free times with their hours", () => {
        draw({ person: "meera" });
        expect(desk().textContent).not.toContain("lane per person");
        const ananya = desk().querySelector<HTMLElement>(
            '[data-diary-block][aria-label*="Ananya Desai"]',
        );
        expect(ananya?.style.left).toBe("");
        expect(desk().querySelector('[aria-label*="Vikram Nair"]')).toBeNull();
        const free = desk().querySelector<HTMLButtonElement>(
            "button[data-week-free]",
        );
        expect(free?.textContent).toMatch(/^Free · \d/);
    });

    it("books a free time on its own day", () => {
        draw();
        const wedFree = desk().querySelector<HTMLButtonElement>(
            `[data-diary-column="${WED}"] button[data-week-free][aria-label*="Meera Iyer"]`,
        );
        act(() => wedFree?.click());
        expect(dialogText()).toContain(`Book Meera Iyer on ${WED} from 540`);
    });

    it("says a closed Sunday is closed, and opens hours on it", () => {
        draw();
        const sun = desk().querySelector<HTMLElement>(
            `[data-diary-column="${SUN}"] [data-week-closed]`,
        );
        expect(sun?.textContent).toContain("Closed on Sundays");
        expect(sun?.textContent).toContain(
            "Nobody takes bookings on Sun 25 Oct.",
        );
        expect(heading("Sun 25 Oct").textContent).toContain("Closed");
        const open = sun ? byText(sun, "Open hours on this day") : undefined;
        act(() => open?.click());
        // Everyone is picked: the first person, from when they usually start.
        expect(dialogText()).toContain(
            `Open hours Meera Iyer on ${SUN} from 540`,
        );
    });

    it("opens the day from its heading, by click or keyboard", () => {
        draw();
        const wed = heading("Wed 21 Oct");
        wed.focus();
        expect(document.activeElement).toBe(wed);
        act(() => wed.click());
        expect(push).toHaveBeenCalledWith(
            `/bookings?date=${WED}&layout=day&person=all`,
            { scroll: false },
        );
    });

    it("opens a booking's quick look", () => {
        draw();
        act(() =>
            desk()
                .querySelector<HTMLButtonElement>(
                    '[data-diary-block][aria-label*="Kabir Singh"]',
                )
                ?.click(),
        );
        expect(dialogText()).toContain("Quick look kabir");
    });

    it("for a role that only reads the calendar: free time drawn, not pressed", () => {
        draw({ can: { book: false, hours: false } });
        expect(desk().querySelectorAll("div[data-week-free]").length).toBe(
            desk().querySelectorAll("[data-week-free]").length,
        );
        expect(desk().querySelectorAll("button[data-week-free]")).toHaveLength(
            0,
        );
        expect(desk().textContent).toContain("Closed on Sundays");
        expect(desk().textContent).not.toContain("Open hours on this day");
        expect(desk().textContent).toContain("Click a day to open it.");
        expect(desk().textContent).not.toContain("a free time to book");
    });

    it("without the hours, counts stay and nothing is guessed", () => {
        draw({ staff: null });
        expect(heading("Mon 19 Oct").textContent).toContain("3 booked");
        expect(desk().querySelector("[data-fullness]")).toBeNull();
        expect(desk().querySelector("[data-week-free]")).toBeNull();
        expect(desk().querySelector("[data-week-closed]")).toBeNull();
        expect(host.textContent).toContain("Couldn't load hours and time off.");
    });

    it("an empty week: every day at nothing booked, free time to book", () => {
        draw({ calendar: calendarOf([]) });
        expect(heading("Mon 19 Oct").textContent).toContain("0 booked");
        expect(desk().querySelector("[data-diary-block]")).toBeNull();
        expect(
            desk().querySelectorAll("button[data-week-free]").length,
        ).toBeGreaterThan(0);
    });
});

describe("the week on a phone", () => {
    it("shows Monday to Sunday with counts, today picked", () => {
        draw();
        const cells = phone().querySelectorAll('[role="radio"]');
        expect(cells).toHaveLength(7);
        expect(
            phone()
                .querySelector('[role="radiogroup"]')
                ?.getAttribute("aria-label"),
        ).toBe("Pick a day of the week");
        const mon = dayCell("Mon 19 Oct");
        expect(mon.getAttribute("aria-checked")).toBe("true");
        expect(mon.getAttribute("aria-label")).toBe(
            "Mon 19 Oct, today, 3 bookings",
        );
        expect(mon.textContent).toContain("Today");
        expect(dayCell("Sun 25 Oct").getAttribute("aria-label")).toBe(
            "Sun 25 Oct, closed",
        );
        expect(dayCell("Sun 25 Oct").textContent).toContain("–");
        // The bar says how full: Monday's is taller than Tuesday's.
        const bar = (label: string) =>
            Number(
                dayCell(label)
                    .querySelector("[data-bar]")
                    ?.getAttribute("data-bar"),
            );
        expect(bar("Mon 19 Oct")).toBeGreaterThan(bar("Tue 20 Oct"));
    });

    it("lists the picked day: bookings and free times in time order", () => {
        draw();
        expect(phone().querySelector("h2")?.textContent).toBe(
            "Mon 19 Oct · today",
        );
        // Meera: free 9:45, 12:15 and 3 pm; Arjun: free from 11.
        expect(phone().textContent).toContain("3 bookings · 4 free times");
        const rows = Array.from(phone().querySelectorAll("ul > li")).map(
            (li) => li.textContent,
        );
        expect(rows[0]).toContain("Ananya Desai");
        expect(rows[1]).toContain("Free · Meera until 11:30 am");
        expect(rows[1]).toContain("Book");
        expect(rows[2]).toContain("Vikram Nair");
    });

    it("a tap picks a day at once, its count agrees, and the address follows", () => {
        draw();
        const wed = dayCell("Wed 21 Oct");
        act(() => wed.click());
        expect(wed.getAttribute("aria-checked")).toBe("true");
        expect(dayCell("Mon 19 Oct").getAttribute("aria-checked")).toBe(
            "false",
        );
        expect(phone().querySelector("h2")?.textContent).toBe("Wed 21 Oct");
        expect(wed.textContent).toMatch(/^1/);
        expect(phone().textContent).toContain("1 booking · ");
        expect(push).toHaveBeenCalledWith(
            `/bookings?date=${WED}&layout=week&person=all`,
            { scroll: false },
        );
    });

    it("moves along the strip with the arrow keys", () => {
        draw();
        const mon = dayCell("Mon 19 Oct");
        expect(mon.tabIndex).toBe(0);
        expect(dayCell("Tue 20 Oct").tabIndex).toBe(-1);
        mon.focus();
        act(() => {
            mon.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        const tue = dayCell("Tue 20 Oct");
        expect(tue.getAttribute("aria-checked")).toBe("true");
        expect(document.activeElement).toBe(tue);
        act(() => {
            tue.dispatchEvent(
                new KeyboardEvent("keydown", { key: "End", bubbles: true }),
            );
        });
        expect(dayCell("Sun 25 Oct").getAttribute("aria-checked")).toBe("true");
    });

    it("a day with no bookings but free time lists only free times", () => {
        draw({ date: "2026-10-20" });
        expect(phone().textContent).toContain("0 bookings · 3 free times");
        const rows = phone().querySelectorAll("ul > li");
        expect(rows).toHaveLength(3);
        rows.forEach((r) =>
            expect(r.hasAttribute("data-week-free")).toBe(true),
        );
    });

    it("a free time books that person on that day", () => {
        draw({ date: WED });
        const free = phone().querySelector<HTMLButtonElement>(
            "li[data-week-free] button",
        );
        act(() => free?.click());
        expect(dialogText()).toContain(`Book Meera Iyer on ${WED} from 540`);
    });

    it("a booking opens its quick look", () => {
        draw();
        const row = Array.from(
            phone().querySelectorAll<HTMLButtonElement>("ul > li > button"),
        ).find((b) => b.textContent.includes("Kabir Singh"));
        act(() => row?.click());
        expect(dialogText()).toContain("Quick look kabir");
    });

    it("Sunday is closed, and opens hours on that day", () => {
        draw({ date: SUN });
        expect(phone().textContent).toContain("Closed on Sundays");
        expect(phone().textContent).toContain(
            "Nobody takes bookings on Sun 25 Oct. Open some hours if you want to see someone that day.",
        );
        const open = byText(phone(), "Open hours on this day");
        act(() => open?.click());
        expect(dialogText()).toContain(`Open hours Meera Iyer on ${SUN}`);
    });

    it("one person: the title names them, the list is theirs", () => {
        draw({ person: "arjun" });
        expect(phone().querySelector("h2")?.textContent).toBe(
            "Mon 19 Oct · today · Arjun",
        );
        expect(phone().textContent).toContain("1 booking · 1 free time");
        expect(phone().textContent).not.toContain("Ananya Desai");
        expect(dayCell("Mon 19 Oct").getAttribute("aria-label")).toBe(
            "Mon 19 Oct, today, 1 booking",
        );
        // Opening hours on Sunday is for Arjun, who is picked.
        act(() => dayCell("Sun 25 Oct").click());
        act(() => byText(phone(), "Open hours on this day")?.click());
        expect(dialogText()).toContain(
            `Open hours Arjun Rao on ${SUN} from 600`,
        );
    });

    it("for a role that only reads the calendar: rows, no Book", () => {
        draw({ can: { book: false, hours: false } });
        const free = phone().querySelectorAll("li[data-week-free]");
        expect(free.length).toBe(4);
        free.forEach((f) => {
            expect(f.querySelector("button")).toBeNull();
            expect(f.textContent).not.toContain("Book");
        });
        act(() => dayCell("Sun 25 Oct").click());
        expect(phone().textContent).toContain("Closed on Sundays");
        expect(byText(phone(), "Open hours on this day")).toBeUndefined();
        expect(phone().textContent).not.toContain("Open some hours");
    });

    it("an empty week: zeros on the strip, the day's free times below", () => {
        draw({ calendar: calendarOf([]) });
        for (const label of ["Mon 19 Oct", "Wed 21 Oct", "Sat 24 Oct"]) {
            expect(dayCell(label).textContent).toMatch(/^0/);
        }
        expect(phone().textContent).toContain("0 bookings · 3 free times");
    });

    it("without the hours: counts and bookings, no free times, nothing closed", () => {
        draw({ staff: null, date: SUN });
        expect(phone().textContent).toContain("0 bookings");
        expect(phone().textContent).not.toContain("free time");
        expect(phone().textContent).not.toContain("Closed on");
        expect(phone().textContent).toContain("Nothing booked on Sun 25 Oct.");
        // Bars are measured against the busiest day instead.
        const bar = (label: string) =>
            Number(
                dayCell(label)
                    .querySelector("[data-bar]")
                    ?.getAttribute("data-bar"),
            );
        expect(bar("Mon 19 Oct")).toBe(40);
    });

    it("says what the bar means and that a swipe steps the week", () => {
        draw();
        expect(phone().textContent).toContain(
            "The bar on each day shows how full it is. Tap a day to see its bookings and free times. Swipe left or right for the week before or after.",
        );
    });
});
