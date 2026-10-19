// @vitest-environment jsdom
/**
 * Open closed time (U10, #1026; BKMOpenHours, BKDOpenHours), at a phone's
 * width and a desk's: open for bookings, just this day or every such
 * weekday; how long, from the half hour pressed; bookings already in the
 * time said plainly; each save with a toast and Undo; a refused save kept
 * in the sheet with the reason; the keyboard; and who is offered it from
 * the Day calendar (a Member, not Calendar only). Blocking free time is
 * the free-time sheet's (U9).
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { router, actions, toast } = vi.hoisted(() => ({
    router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
    actions: {
        addExtraHours: vi.fn(),
        removeExtraHours: vi.fn(),
        replaceStaffHours: vi.fn(),
    },
    toast: {
        dismissToast: vi.fn(),
        dismissToasts: vi.fn(),
        showError: vi.fn(),
        showInfo: vi.fn(),
        showSuccess: vi.fn(),
        showUndo: vi.fn(() => "toast"),
        showWarning: vi.fn(),
    },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/staff/actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);
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
vi.mock("./booking-quick-look", () => ({ BookingQuickLook: () => null }));
vi.mock("./new-booking-from-gap", () => ({ NewBookingFromGap: () => null }));

import type { BookingsCalendar } from "@/lib/services/booking-calendar";
import type { Block } from "@/lib/services/diary";
import type { StaffView, WeeklyRange } from "@/lib/staff/types";

import { CalendarScreen } from "./calendar-screen";
import { resetFirstDayHelp } from "./day-states";
import type { HoursTarget } from "./open-hours-dialog";
import { OpenHoursDialog } from "./open-hours-dialog";

const IST = "Asia/Kolkata";
const MONDAY = "2026-10-19";

const range = (dayOfWeek: number, startMinute: number, endMinute: number) => ({
    dayOfWeek,
    startMinute,
    endMinute,
});

/** Meera: 9 to 1, lunch, 3 to 7 on Mondays. */
const WEEK: WeeklyRange[] = [range(1, 540, 780), range(1, 900, 1140)];
const MEERA = {
    id: "st_meera",
    name: "Meera Iyer",
    title: "Physiotherapist",
    status: "ACTIVE",
    paused: false,
    membership: null,
    serviceIds: ["svc"],
    hours: WEEK,
    weeklyMinutes: 480,
    extraHours: [],
    timeOff: [],
} as unknown as StaffView;

const booking = (start: number, end: number, name: string): Block =>
    ({
        kind: "one",
        key: `one:${name}`,
        start,
        end,
        state: "confirmed",
        staffId: MEERA.id,
        booking: { bookerName: name, contact: null, bookerEmail: null },
    }) as unknown as Block;

const WINDOWS: HoursTarget["windows"] = [
    [540, 780],
    [900, 1140],
];

/** Closed at lunch, pressed at 1:00 pm. */
const LUNCH: HoursTarget = {
    staff: MEERA,
    date: MONDAY,
    from: 780,
    windows: WINDOWS,
    blocks: [],
};
/** Closed for the evening, from 7:00 pm. */
const EVENING: HoursTarget = { ...LUNCH, from: 1140 };
let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

function setWidth(phone: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: phone && query.includes("max-width: 759"),
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }),
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.localStorage.clear();
    vi.clearAllMocks();
    actions.addExtraHours.mockResolvedValue({
        ok: true,
        data: {
            ...MEERA,
            extraHours: [
                {
                    id: "x9",
                    date: `${MONDAY}T00:00:00.000Z`,
                    startMinute: 780,
                    endMinute: 900,
                },
            ],
        },
    });
    actions.replaceStaffHours.mockResolvedValue({ ok: true, data: MEERA });
    actions.removeExtraHours.mockResolvedValue({ ok: true, data: MEERA });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(target: HoursTarget | null, today = MONDAY) {
    act(() =>
        root.render(
            <OpenHoursDialog target={target} today={today} onClose={onClose} />,
        ),
    );
}

const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
const said = (el: Element | null | undefined) =>
    (el?.textContent ?? "").replace(/\u00a0/g, " ");

function button(name: string | RegExp, within: ParentNode = document.body) {
    const hit = Array.from(within.querySelectorAll("button")).find((b) => {
        const words = said(b).trim();
        return typeof name === "string" ? words === name : name.test(words);
    });
    if (!hit) throw new Error(`No "${String(name)}" button`);
    return hit;
}
const hasButton = (name: string | RegExp) => {
    try {
        button(name);
        return true;
    } catch {
        return false;
    }
};
/** A chip, by its words. */
const radioNamed = (name: string) => {
    const hit = Array.from(
        document.body.querySelectorAll<HTMLElement>("[role=radio]"),
    ).find((r) => said(r).trim() === name);
    if (!hit) throw new Error(`No "${name}" choice`);
    return hit;
};
/** A RadioCards row, by its words. */
const cardNamed = (words: string) => {
    const label = Array.from(document.body.querySelectorAll("label")).find(
        (l) => said(l).includes(words),
    );
    const hit = label?.querySelector<HTMLElement>("[role=radio]");
    if (!hit) throw new Error(`No "${words}" row`);
    return hit;
};
const chips = () =>
    Array.from(
        sheet()?.querySelectorAll<HTMLElement>(
            "[aria-labelledby] > [role=radio]",
        ) ?? [],
    )
        .filter((r) => r.tagName === "BUTTON")
        .map((r) => said(r).trim());
const chosen = () =>
    said(
        sheet()?.querySelector(
            "[role=radiogroup][aria-labelledby] > [aria-checked=true]",
        ),
    ).trim();
const rangeBox = () => said(sheet()?.querySelector("[data-range]"));

async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}
async function save() {
    const submit = sheet()?.querySelector<HTMLButtonElement>(
        "button[type=submit]",
    );
    if (!submit) throw new Error("No save button");
    await press(submit);
}
/** The last Undo offered, pressed. */
async function undo() {
    const calls = toast.showUndo.mock.calls as unknown as [
        string,
        () => Promise<unknown>,
    ][];
    const last = calls.at(-1);
    if (!last) throw new Error("No Undo offered");
    await act(async () => {
        await last[1]();
    });
}
const undoText = () =>
    (toast.showUndo.mock.calls.at(-1) as unknown as [string] | undefined)?.[0];

describe.each([
    ["on a phone", true],
    ["at a desk", false],
])("open closed time, %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    it("opens closed time for bookings, all of the lunch break, just today, with Undo", async () => {
        draw(LUNCH);
        const s = sheet();
        expect(said(s)).toContain("Open Meera's closed time");
        expect(said(s)).toContain("Meera Iyer · Mon 19 Oct");
        expect(said(s)).toContain("How long, from 1:00 pm");
        expect(chips()).toEqual([
            "All the closed time · 2 hours",
            "1 hour",
            "30 min",
        ]);
        expect(chosen()).toBe("All the closed time · 2 hours");
        expect(rangeBox()).toBe("Open · 1:00 to 3:00 pm");
        expect(cardNamed("Just Mon 19 Oct").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(said(s)).toContain("Meera's weekly hours stay the same.");
        expect(said(s)).toContain("Every Monday");
        expect(said(s)).toContain(
            "Customers can book the time you open, the same as Meera's other hours.",
        );

        await save();
        expect(actions.addExtraHours).toHaveBeenCalledWith("st_meera", {
            date: MONDAY,
            startMinute: 780,
            endMinute: 900,
        });
        expect(onClose).toHaveBeenCalled();
        expect(router.refresh).toHaveBeenCalled();
        expect(undoText()).toBe("Opened 1:00 to 3:00 pm for Meera, today.");
        await undo();
        expect(actions.removeExtraHours).toHaveBeenCalledWith("st_meera", "x9");
    });

    it("opens a shorter time, and says the day when it isn't today", async () => {
        draw(LUNCH, "2026-10-18");
        await press(radioNamed("1 hour"));
        expect(rangeBox()).toBe("Open · 1:00 to 2:00 pm");
        expect(button("Open 1:00 to 2:00 pm")).toBeTruthy();
        await save();
        expect(actions.addExtraHours).toHaveBeenCalledWith("st_meera", {
            date: MONDAY,
            startMinute: 780,
            endMinute: 840,
        });
        expect(undoText()).toBe(
            "Opened 1:00 to 2:00 pm for Meera on Mon 19 Oct.",
        );
    });

    it("opens the evening every Monday: one to four hours, added to the weekly hours", async () => {
        draw(EVENING);
        expect(said(sheet())).toContain("How long, from 7:00 pm");
        expect(chips()).toEqual(["1 hour", "2 hours", "3 hours", "4 hours"]);
        expect(chosen()).toBe("2 hours");
        await press(cardNamed("Every Monday"));
        expect(said(sheet())).toContain("Adds it to Meera's weekly hours.");
        await save();
        expect(actions.replaceStaffHours).toHaveBeenCalledWith("st_meera", [
            ...WEEK,
            range(1, 1140, 1260),
        ]);
        expect(actions.addExtraHours).not.toHaveBeenCalled();
        expect(undoText()).toBe(
            "Opened 7:00 to 9:00 pm for Meera, every Monday.",
        );
        await undo();
        expect(actions.replaceStaffHours).toHaveBeenLastCalledWith(
            "st_meera",
            WEEK,
        );
    });

    it("starts from the half hour pressed", () => {
        draw({ ...LUNCH, from: 810 });
        expect(said(sheet())).toContain("How long, from 1:30 pm");
        expect(chosen()).toBe("Until 3:00 pm · 1 hr 30 min");
        expect(rangeBox()).toBe("Open · 1:30 to 3:00 pm");
    });

    it("says plainly which bookings are already in the time, and opens it", async () => {
        draw({ ...EVENING, blocks: [booking(1170, 1200, "Kabir")] });
        const note = Array.from(
            sheet()?.querySelectorAll("p[data-ph-mask]") ?? [],
        ).map(said);
        expect(note).toContain(
            "Kabir at 7:30 pm is already booked in this time. Customers can book the rest.",
        );
        await save();
        expect(actions.addExtraHours).toHaveBeenCalled();
    });

    it("says why working time can't be opened, and saves nothing", async () => {
        draw({ ...LUNCH, from: 600 });
        expect(said(sheet()?.querySelector("[role=alert]"))).toBe(
            "Meera already works at 10:00 am, so customers can book it now. Change hours on Hours and time off.",
        );
        await save();
        expect(actions.addExtraHours).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("keeps a refused save in the sheet, with the reason and the choice", async () => {
        actions.addExtraHours.mockResolvedValueOnce({
            ok: false,
            error: "Those hours overlap hours Meera already has.",
        });
        draw(LUNCH);
        await press(radioNamed("1 hour"));
        await save();
        expect(onClose).not.toHaveBeenCalled();
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(said(sheet())).toContain(
            "Those hours overlap hours Meera already has.",
        );
        expect(chosen()).toBe("1 hour");
        // Changing the choice clears it.
        await press(radioNamed("30 min"));
        expect(said(sheet())).not.toContain("Those hours overlap");
    });

    it("is used from the keyboard: arrows move each choice", () => {
        draw(LUNCH);
        const first = radioNamed("All the closed time · 2 hours");
        act(() => first.focus());
        act(() => {
            first.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        expect(chosen()).toBe("1 hour");
        expect(document.activeElement).toBe(radioNamed("1 hour"));
        expect(rangeBox()).toBe("Open · 1:00 to 2:00 pm");
        // Repeat is a radio group named by its heading: the arrows move it.
        const repeat = cardNamed("Every Monday").closest("[role=radiogroup]");
        const by = repeat?.getAttribute("aria-labelledby") ?? "";
        expect(said(document.getElementById(by))).toBe("Repeat");
    });

    it("closes on Cancel without saving", async () => {
        draw(LUNCH);
        await press(button("Cancel"));
        expect(onClose).toHaveBeenCalled();
        expect(actions.addExtraHours).not.toHaveBeenCalled();
    });
});

describe.each([
    ["on a phone", true],
    ["at a desk", false],
])("who is offered it from the Day, %s", (_scene, phone) => {
    const DAY = "2026-09-29"; // a Tuesday
    const tuesday: StaffView = {
        ...MEERA,
        id: "meera",
        hours: [range(2, 540, 1020)],
    };
    const calendar: BookingsCalendar = {
        from: "",
        to: "",
        timezone: IST,
        money: true,
        diaries: [
            {
                person: { id: "meera", name: "Meera Iyer", title: null },
                bookings: [],
                classes: [],
            },
        ],
    };

    beforeEach(() => {
        setWidth(phone);
        window.history.replaceState(null, "", `/bookings?date=${DAY}`);
        resetFirstDayHelp();
    });

    function drawDay(can: {
        book: boolean;
        hours: boolean;
        addPeople?: boolean;
    }) {
        act(() =>
            root.render(
                <CalendarScreen
                    layout="day"
                    date={DAY}
                    today="2026-09-30"
                    now={Date.parse("2026-09-30T06:00:00Z")}
                    timezone={IST}
                    calendar={calendar}
                    staff={[tuesday]}
                    services={[]}
                    rules={null}
                    people={{ canSearch: false, payLink: false }}
                    can={can}
                    newBooking={<button type="button">New booking</button>}
                />,
            ),
        );
    }
    const closedTimes = () =>
        Array.from(
            host.querySelectorAll<HTMLButtonElement>("[data-closed-time]"),
        );

    it("a Member (hours:write) opens closed time in the sheet, from 5:00 pm", async () => {
        drawDay({ book: true, hours: true, addPeople: false });
        const evening = closedTimes().at(-1);
        expect(evening).toBeTruthy();
        act(() => {
            evening?.dispatchEvent(
                new MouseEvent("click", { bubbles: true, detail: 0 }),
            );
        });
        expect(said(sheet())).toContain("Open Meera's closed time");
        expect(said(sheet())).toContain("How long, from 5:00 pm");
        await save();
        expect(actions.addExtraHours).toHaveBeenCalledWith("meera", {
            date: DAY,
            startMinute: 1020,
            endMinute: 1140,
        });
        expect(undoText()).toBe(
            "Opened 5:00 to 7:00 pm for Meera on Tue 29 Sep.",
        );
    });

    it("Calendar only is never offered it: closed time only says Closed", () => {
        drawDay({ book: false, hours: false });
        expect(closedTimes()).toHaveLength(0);
        expect(hasButton(/^Open /)).toBe(false);
        expect(sheet()).toBeNull();
    });
});
