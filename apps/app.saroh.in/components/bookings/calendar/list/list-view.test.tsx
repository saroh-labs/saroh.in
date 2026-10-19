// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    BookingsCalendar,
    ClassSession,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { StaffView } from "@/lib/staff/types";

import { CalendarScreen } from "../calendar-screen";

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
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
vi.mock("../../availability/add-person-dialog", () => ({
    AddPersonDialog: () => null,
}));
vi.mock("../booking-quick-look", () => ({
    BookingQuickLook: ({ block }: { block: { key: string } | null }) =>
        block ? <div role="dialog">Quick look {block.key}</div> : null,
}));
// The free-time sheet: books, or blocks the time instead (U9's switch).
vi.mock("../new-booking-from-gap", () => ({
    NewBookingFromGap: ({
        target,
        onBlock,
    }: {
        target: {
            staff: { name: string };
            date: string;
            free: readonly [number, number];
        } | null;
        onBlock: (t: unknown) => void;
    }) =>
        target ? (
            <div role="dialog">
                Book {target.staff.name} from {target.free[0]} on {target.date}
                <button type="button" onClick={() => onBlock(target)}>
                    Block this time
                </button>
            </div>
        ) : null,
}));
vi.mock("../open-hours-dialog", () => ({
    OpenHoursDialog: ({
        target,
    }: {
        target: {
            staff: { name: string };
            mode: string;
            from: number;
            date: string;
        } | null;
    }) =>
        target ? (
            <div role="dialog">
                {target.mode} {target.staff.name} from {target.from} on{" "}
                {target.date}
            </div>
        ) : null,
}));

/**
 * Bookings › List (U6, #1022): the Next card, the booked rows, the free
 * times (a card that opens on a phone, a right-hand column on the desk,
 * each with Book, and Block in the sheet it opens), a closed day as Week
 * draws it, a quiet open day with "Book on this day", and what each role
 * may press. Both sizes are one tree: what changes at 760px is said by its
 * classes, which these read.
 */

const IST = "Asia/Kolkata";
const TUE = "2026-09-29"; // a Tuesday
const SUN = "2026-10-04";
const THU = "2026-10-01";
const at = (day: string, hour: number) =>
    Date.parse(`${day}T00:00:00+05:30`) + hour * 3_600_000;

const booking = (
    id: string,
    name: string,
    hour: number,
    minutes: number,
    extra: Partial<DiaryBooking> = {},
    day = TUE,
): DiaryBooking => ({
    id,
    serviceId: "svc",
    startAt: new Date(at(day, hour)).toISOString(),
    endAt: new Date(at(day, hour) + minutes * 60_000).toISOString(),
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
    paidWith: "DESK",
    packName: null,
    subscriptionId: null,
    ...extra,
});

const pilates = (taken: number): ClassSession => ({
    key: "pilates-7",
    service: {
        id: "pil",
        name: "Mat Pilates",
        timezone: IST,
        capacity: 8,
        durationMinutes: 60,
        priceCents: 30_000,
        currency: "INR",
    },
    startAt: new Date(at(TUE, 7)).toISOString(),
    endAt: new Date(at(TUE, 8)).toISOString(),
    staff: { id: "neha", name: "Neha Kapoor" },
    capacity: 8,
    taken,
    bookings: Array.from({ length: taken }, (_, i) =>
        booking(`p${i}`, `Seat ${i}`, 7, 60, {
            serviceId: "pil",
            staff: { id: "neha", name: "Neha Kapoor" },
        }),
    ),
});

/** Monday to Saturday, 9 to 5: closed on Sundays. */
const person = (id: string, name: string, extra: object = {}) =>
    ({
        id,
        name,
        title: null,
        status: "ACTIVE",
        paused: false,
        serviceIds: ["svc"],
        hours: [1, 2, 3, 4, 5, 6].map((d) => ({
            dayOfWeek: d,
            startMinute: 540,
            endMinute: 1020,
        })),
        extraHours: [],
        timeOff: [],
        ...extra,
    }) as unknown as StaffView;
const meera = person("meera", "Meera Iyer");
const arjun = person("arjun", "Arjun Rao");

const calendarOf = (
    mine: DiaryBooking[],
    classes: ClassSession[] = [],
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
            bookings: [],
            classes,
        },
    ],
});

const today = calendarOf(
    [
        booking("ananya", "Ananya Desai", 9, 45, { outcome: "ATTENDED" }),
        booking("kabir", "Kabir Singh", 11, 45),
        booking("priya", "Priya Menon", 15, 45, { status: "PENDING" }),
        booking("dev", "Dev Malhotra", 13, 30, { status: "CANCELLED" }),
    ],
    [pilates(6)],
);

let host: HTMLDivElement;
let root: Root;
let phone = false;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState(null, "", `/bookings?layout=agenda`);
    document.cookie = "saroh_bookings_view=; max-age=0; path=/";
    phone = false;
    window.matchMedia = ((query: string) => ({
        matches: phone && query.includes("max-width"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    push.mockClear();
    replace.mockClear();
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
                layout="agenda"
                date={TUE}
                today={TUE}
                // 10:50 am in India: Kabir's 11:00 is in 10 minutes.
                now={at(TUE, 10) + 50 * 60_000}
                timezone={IST}
                calendar={calendar}
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

const q = <E extends Element = HTMLElement>(sel: string) =>
    host.querySelector<E & HTMLElement>(sel);
const rows = () =>
    Array.from(
        host.querySelectorAll<HTMLButtonElement>(
            'section[aria-label="Booked"] li > button',
        ),
    );
const freeSection = () => q('section[aria-label="Free times"]');
const phoneFreeToggle = () =>
    freeSection()?.querySelector<HTMLButtonElement>("button[aria-expanded]");
const freeButtons = () =>
    Array.from(
        freeSection()?.querySelectorAll<HTMLButtonElement>("li button") ?? [],
    );
const text = () => host.textContent;
const button = (name: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent.trim() === name,
    );

describe("the Next card", () => {
    it("shows today's next booking, how soon, and Open opens its quick look", () => {
        draw(today);
        const next = q('[data-list-next=""]');
        expect(next?.textContent).toContain("11:00 am · Kabir Singh");
        expect(next?.textContent).toContain(
            "Physio assessment with Meera · in 10 min",
        );
        const open = next?.querySelector("button");
        expect(open?.textContent).toBe("Open");
        expect(open?.getAttribute("aria-label")).toBe(
            "Open 11:00 am · Kabir Singh",
        );
        act(() => open?.click());
        expect(text()).toContain("Quick look kabir");
    });

    it("is a bold line on a phone and a display title on the desk", () => {
        draw(today);
        const title = q('[data-list-next=""] span.flex-1 > span');
        expect(title?.className).toContain("text-[14.5px]");
        expect(title?.className).toContain("min-[760px]:text-[19px]");
        // Its row is lit, and on a phone its badge says Next.
        const kabir = rows().find((r) => r.textContent.includes("Kabir"));
        expect(kabir?.className).toContain("bg-highlight-subtle");
        expect(kabir?.textContent).toContain("Next");
    });

    it("is not drawn on another day, nor when nothing is left today", () => {
        draw(today, { today: "2026-09-28" });
        expect(q('[data-list-next=""]')).toBeNull();
        draw(today, { now: at(TUE, 18) });
        expect(q('[data-list-next=""]')).toBeNull();
    });
});

describe("the booked rows", () => {
    it("list the day in time order, each opening its quick look", () => {
        draw(today);
        const titles = rows().map(
            (r) => r.querySelector(".flex-1 > span")?.textContent,
        );
        expect(titles).toEqual([
            "Mat Pilates",
            "Ananya Desai",
            "Kabir Singh",
            "Priya Menon",
        ]);
        act(() => rows()[3]?.click());
        expect(text()).toContain("Quick look priya");
    });

    it("say who takes each one and how it stands", () => {
        draw(today);
        const [cls, ananya, , priya] = rows();
        expect(cls.textContent).toContain("Neha Kapoor · 6 of 8 places");
        expect(cls.textContent).toContain("2 left");
        expect(cls.textContent).toContain("2 places left");
        expect(ananya.textContent).toContain("Physio assessment · Meera");
        expect(ananya.textContent).toContain("Came");
        expect(priya.textContent).toContain("Awaiting payment");
    });

    it("count what is booked in the desk's heading, and a phone's label sits above", () => {
        draw(today);
        const head = q(
            'section[aria-label="Booked"] .max-\\[759px\\]\\:hidden',
        );
        expect(head?.textContent).toBe("Booked4 bookings");
        const label = q('section[aria-label="Booked"] > .label');
        expect(label?.className).toContain("min-[760px]:hidden");
    });

    it("leave cancelled ones off until asked, then strike them through", () => {
        draw(today);
        expect(text()).not.toContain("Dev Malhotra");
        draw(today, { showCancelled: true });
        const dev = rows().find((r) => r.textContent.includes("Dev"));
        expect(dev?.textContent).toContain("Cancelled");
        expect(dev?.querySelector(".line-through")).not.toBeNull();
    });

    it("are buttons a keyboard reaches, one per booking", () => {
        draw(today);
        for (const r of rows()) {
            expect(r.tagName).toBe("BUTTON");
            expect(r.getAttribute("type")).toBe("button");
        }
        rows()[1]?.focus();
        expect(document.activeElement).toBe(rows()[1]);
    });
});

describe("the free times", () => {
    it("are a card that opens on a phone, with the tally and 48px rows", () => {
        draw(today);
        const toggle = phoneFreeToggle();
        expect(toggle?.className).toContain("min-[760px]:hidden");
        expect(toggle?.textContent).toContain("4 free times today");
        expect(toggle?.textContent).toContain(
            "Meera 3 · Arjun 1 · tap to book one",
        );
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        const list = freeSection()?.querySelector("ul");
        expect(list?.className).toContain("max-[759px]:hidden");
        act(() => toggle?.click());
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        expect(list?.className).not.toContain("max-[759px]:hidden");
        expect(freeButtons()[0]?.className).toContain("min-h-12");
    });

    it("are a right-hand column on the desk, always open", () => {
        draw(today);
        const view = q('[data-list-view=""]');
        expect(view?.className).toContain(
            "min-[760px]:grid-cols-[minmax(0,1fr)_340px]",
        );
        expect(freeSection()?.className).toContain("min-[760px]:col-start-2");
        const head = freeSection()?.querySelector("h2");
        expect(head?.textContent).toBe("4 free times");
        expect(head?.parentElement?.className).toContain("max-[759px]:hidden");
        expect(freeSection()?.textContent).toContain(
            "Click one to book someone or block it. Each says who is free.",
        );
    });

    it("Book opens the free-time sheet on that person and time", () => {
        draw(today);
        const first = freeButtons()[0];
        expect(first.getAttribute("aria-label")).toBe(
            "Book Meera Iyer at 9:45 am, free 9:45 to 11:00 am",
        );
        expect(first.textContent).toContain("Book");
        act(() => first.click());
        expect(text()).toContain("Book Meera Iyer from 585 on 2026-09-29");
    });

    it("Block, from that sheet, opens Block on the same time", () => {
        draw(today);
        act(() => freeButtons()[0]?.click());
        act(() => button("Block this time")?.click());
        expect(text()).toContain("block Meera Iyer from 585 on 2026-09-29");
    });

    it("name the one person shown", () => {
        draw(today, { person: "meera" });
        expect(phoneFreeToggle()?.textContent).toContain(
            "Meera · tap to book one",
        );
        expect(freeSection()?.textContent).toContain(
            "Click one to book Meera or block it.",
        );
    });

    it("say so in one line when nobody is free", () => {
        const full = calendarOf([booking("all", "All Day", 9, 480)]);
        draw(full, { person: "meera" });
        expect(phoneFreeToggle()).toBeNull();
        expect(freeSection()?.textContent).toContain("No free times this day");
        expect(freeSection()?.textContent).toContain("Nobody has free time");
    });

    it("are left out when the hours couldn't be read, and the screen says so", () => {
        draw(today, { staff: null });
        expect(freeSection()).toBeNull();
        expect(text()).toContain("Couldn't load hours and time off");
        expect(rows()).toHaveLength(4);
    });
});

describe("a day with nothing booked", () => {
    it("closed: as Week says it, with Open hours on this day", () => {
        draw(calendarOf([]), { date: SUN });
        const empty = q('[data-list-empty="closed"]');
        expect(empty?.textContent).toContain("Closed on Sundays");
        expect(empty?.textContent).toContain(
            "Nobody takes bookings on Sun 4 Oct. Open some hours if you want to see someone that day.",
        );
        // The desk shows the closed day alone; a phone keeps "No free times".
        expect(freeSection()?.className).toContain("min-[760px]:hidden");
        expect(freeSection()?.textContent).toContain("No free times this day");
        act(() => button("Open hours on this day")?.click());
        expect(text()).toContain("open Meera Iyer from 540 on 2026-10-04");
    });

    it("closed: opens your own hours when you take bookings", () => {
        draw(calendarOf([]), {
            date: SUN,
            me: { id: "arjun", name: "Arjun Rao" },
        });
        act(() => button("Open hours on this day")?.click());
        expect(text()).toContain("open Arjun Rao from 540");
    });

    it("closed by time off: names the day, not the weekday", () => {
        const off = [
            {
                startAt: new Date(at(THU, 0)).toISOString(),
                endAt: new Date(at(THU, 24)).toISOString(),
            },
        ];
        draw(calendarOf([]), {
            date: THU,
            staff: [
                person("meera", "Meera Iyer", { timeOff: off }),
                person("arjun", "Arjun Rao", { timeOff: off }),
            ],
        });
        expect(q('[data-list-empty="closed"]')?.textContent).toContain(
            "Closed on Thu 1 Oct",
        );
    });

    it("quiet and open: Book on this day books its first free time", () => {
        draw(calendarOf([]), { date: THU, share: null });
        const empty = q('[data-list-empty="open"]');
        expect(empty?.textContent).toContain("Nothing booked on Thu 1 Oct");
        expect(empty?.textContent).toContain(
            "The day is open. Book someone in.",
        );
        act(() => button("Book on this day")?.click());
        expect(text()).toContain("Book Meera Iyer from 540 on 2026-10-01");
        // Its free times stay beside it on the desk.
        expect(freeSection()?.className).not.toContain("min-[760px]:hidden");
    });

    it("quiet and open: offers the booking page while it is live", () => {
        draw(calendarOf([]), {
            date: THU,
            share: <button type="button">Share your booking page</button>,
        });
        expect(text()).toContain(
            "The day is open. Book someone in, or share your booking page so customers can.",
        );
        expect(button("Share your booking page")).toBeDefined();
    });

    it("today: says today", () => {
        draw(calendarOf([]), { date: TUE });
        expect(q('[data-list-empty="open"]')?.textContent).toContain(
            "Nothing booked today",
        );
    });

    it("past: no booking, no opening", () => {
        draw(calendarOf([]), { date: "2026-09-22" });
        expect(q('[data-list-empty="past"]')?.textContent).toContain(
            "Nothing booked on Tue 22 Sep",
        );
        expect(button("Book on this day")).toBeUndefined();
    });
});

describe("roles", () => {
    it("the calendar only: rows open, free times read, nothing to book or open", () => {
        draw(today, { can: { book: false, hours: false } });
        expect(text()).toContain("Your role sees the calendar only");
        act(() => rows()[0]?.click());
        expect(text()).toContain("Quick look pilates-7");
        expect(freeButtons()).toHaveLength(0);
        expect(
            freeSection()?.querySelectorAll('[data-free-still=""]').length,
        ).toBe(4);
        expect(phoneFreeToggle()?.textContent).not.toContain("tap to book");
        expect(freeSection()?.textContent).toContain("Each says who is free.");
        draw(calendarOf([]), {
            date: THU,
            can: { book: false, hours: false },
        });
        expect(button("Book on this day")).toBeUndefined();
        draw(calendarOf([]), { date: SUN, can: { book: false, hours: false } });
        expect(button("Open hours on this day")).toBeUndefined();
        expect(q('[data-list-empty="closed"]')?.textContent).toContain(
            "Nobody takes bookings on Sun 4 Oct.",
        );
    });

    it("a front desk without hours: books, but a closed day has no Open hours", () => {
        draw(calendarOf([]), { date: SUN, can: { book: true, hours: false } });
        expect(button("Open hours on this day")).toBeUndefined();
    });

    it("someone paused by the plan is offered no free time", () => {
        draw(today, {
            staff: [person("meera", "Meera Iyer", { paused: true }), arjun],
        });
        expect(phoneFreeToggle()?.textContent).toContain("1 free time today");
    });
});

describe("List first on a phone (Q4)", () => {
    it("moves Day to List when nothing chose the view", () => {
        phone = true;
        draw(today, { layout: "day", listFirst: true });
        expect(replace).toHaveBeenCalledWith(
            "/bookings?date=2026-09-29&layout=agenda&person=all",
            { scroll: false },
        );
        // The phone's first Day is never kept as its choice.
        expect(document.cookie).not.toContain("saroh_bookings_view=day");
    });

    it("keeps Day on the desk, and remembers it", () => {
        draw(today, { layout: "day", listFirst: true });
        expect(replace).not.toHaveBeenCalled();
        expect(document.cookie).toContain("saroh_bookings_view=day");
    });

    it("keeps a view the person chose, on a phone too", () => {
        phone = true;
        draw(today, { layout: "day", listFirst: false });
        expect(replace).not.toHaveBeenCalled();
    });
});
