// @vitest-environment jsdom
/**
 * Hours and time off's sheets (U17, DEC-170), at a phone's width and a
 * desk's: every change saves as it is made, says so with Undo, and a save
 * that is refused puts the control back and says nothing has changed.
 * A day (open, times, lunch, another shift, "Also use these hours on"),
 * "Change several days" in one save, time off added past the new year and
 * removed with Undo, extra opening hours closed and added, and a booking
 * rule saved on a pick.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { router, actions, toast } = vi.hoisted(() => ({
    router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
    actions: {
        addClosure: vi.fn(),
        addExtraHours: vi.fn(),
        addMyself: vi.fn(),
        addPerson: vi.fn(),
        addTimeOff: vi.fn(),
        previewOff: vi.fn(),
        readOffered: vi.fn(),
        removeClosures: vi.fn(),
        removeExtraHours: vi.fn(),
        removeTimeOffMany: vi.fn(),
        replaceStaffHours: vi.fn(),
        updateBookingRules: vi.fn(),
        updateStaff: vi.fn(),
    },
    toast: {
        dismissToast: vi.fn(),
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showUndo: vi.fn(() => "toast"),
        showWarning: vi.fn(),
    },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/staff/actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);
// A picked day, typed: the calendar popover is the date picker's own test.
vi.mock("@saroh/ui/date-picker", () => ({
    DatePicker: ({
        id,
        value,
        onValueChange,
    }: {
        id: string;
        value?: Date;
        onValueChange: (d: Date | undefined) => void;
    }) => (
        <input
            id={id}
            data-day=""
            defaultValue={
                value
                    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
                    : ""
            }
            onChange={(e) => {
                const [y, m, d] = e.target.value.split("-").map(Number);
                onValueChange(new Date(y, m - 1, d));
            }}
        />
    ),
}));

import type { WeeklyRange } from "@/lib/staff/types";

import type { EditorProps } from "./hours.test-kit";
import {
    MEERA,
    MEERA_WEEK,
    button,
    dialog,
    drawEditor,
    hasButton,
    press,
    radio,
    said,
    setWidth,
    settle,
} from "./hours.test-kit";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const m of [
        ...Object.values(actions),
        ...Object.values(toast),
        ...Object.values(router),
    ]) {
        m.mockReset();
    }
    toast.showUndo.mockReturnValue("toast");
    actions.readOffered.mockResolvedValue({ ok: false, why: "failed" });
    actions.previewOff.mockResolvedValue({ ok: true, data: { affected: [] } });
    actions.replaceStaffHours.mockImplementation(
        (_id: string, hours: WeeklyRange[]) =>
            Promise.resolve({
                ok: true,
                data: { staff: { ...MEERA, hours }, outside: [] },
            }),
    );
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const draw = (over: Partial<EditorProps> = {}) => drawEditor(root, over);

/** The week the last save sent, as "day:from-to" sorted. */
function sent(call = -1): string[] {
    const args = actions.replaceStaffHours.mock.calls.at(call) as
        [string, WeeklyRange[]] | undefined;
    return (args?.[1] ?? [])
        .map((h) => `${h.dayOfWeek}:${h.startMinute}-${h.endMinute}`)
        .sort();
}
const week = (hours: WeeklyRange[]) =>
    hours.map((h) => `${h.dayOfWeek}:${h.startMinute}-${h.endMinute}`).sort();

/** The last Undo's words and its way back. */
function lastUndo() {
    const call = toast.showUndo.mock.calls.at(-1) as unknown as
        [string, () => Promise<unknown>] | undefined;
    if (!call) throw new Error("No Undo toast");
    return { words: call[0], undo: call[1] };
}

const row = (day: string) =>
    Array.from(host.querySelectorAll("li")).find((li) =>
        said(li).startsWith(day),
    );
const switchNamed = (name: string) => {
    const label = Array.from(document.body.querySelectorAll("span")).find(
        (s) => s.textContent === name,
    );
    const hit = label?.id
        ? document.body.querySelector<HTMLElement>(
              `[role=switch][aria-labelledby="${label.id}"]`,
          )
        : null;
    if (!hit) throw new Error(`No "${name}" switch`);
    return hit;
};

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("a day %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    it("closes Saturday with a toast and Undo, and Undo puts it back", async () => {
        draw();
        await press(button(/^Saturday, 9 am to 1 pm/));
        expect(dialog()?.textContent).toContain("Saturday");
        expect(dialog()?.textContent).toContain(
            "Meera's hours · saves as you change it",
        );
        await press(switchNamed("Open on Saturday"));
        await settle();
        expect(actions.replaceStaffHours).toHaveBeenCalledTimes(1);
        expect(sent()).toEqual(
            week(MEERA_WEEK.filter((h) => h.dayOfWeek !== 6)),
        );
        const { words, undo } = lastUndo();
        expect(words).toBe("Saturday is now closed for Meera. Saved.");
        expect(said(row("Saturday"))).toContain("Closed");
        expect(dialog()?.textContent).toContain(
            "Customers can't book Meera on Saturdays.",
        );
        await act(async () => {
            await undo();
        });
        expect(sent()).toEqual(week(MEERA_WEEK));
        expect(said(row("Saturday"))).toContain("9 am to 1 pm");
    });

    it("puts the control back and says nothing changed when a save is refused", async () => {
        draw();
        actions.replaceStaffHours.mockResolvedValueOnce({
            ok: false,
            error: "Your role can't change hours or time off.",
        });
        await press(button(/^Saturday, 9 am to 1 pm/));
        await press(switchNamed("Open on Saturday"));
        await settle();
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save Saturday for Meera. Nothing has changed.",
            "Your role can't change hours or time off.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(
            switchNamed("Open on Saturday").getAttribute("aria-checked"),
        ).toBe("true");
        expect(said(row("Saturday"))).toContain("9 am to 1 pm");
    });

    it("changes when it opens with the time picker, saved at once", async () => {
        draw();
        await press(button(/^Monday, 9 am to 7 pm/));
        await press(button(/^Opens/));
        expect(
            document.body.querySelector("[aria-label='Pick a time for Opens']"),
        ).not.toBeNull();
        await press(button("10 o'clock"));
        await settle();
        expect(sent()).toContain("1:600-780");
        expect(lastUndo().words).toBe("Monday opens at 10:00 am. Saved.");
    });

    it("says a closing time before the opening can't stand, and saves nothing", async () => {
        draw();
        await press(button(/^Monday, 9 am to 7 pm/));
        await press(button(/^Closes/));
        await press(button("am"));
        await settle();
        expect(actions.replaceStaffHours).not.toHaveBeenCalled();
        expect(dialog()?.querySelector("[role=alert]")?.textContent).toBe(
            "It has to close after it opens. It isn't saved yet.",
        );
    });

    it("takes the lunch break away, and adds another shift for a split day", async () => {
        draw();
        await press(button(/^Monday, 9 am to 7 pm/));
        await press(switchNamed("Lunch break"));
        await settle();
        expect(sent().filter((r) => r.startsWith("1:"))).toEqual([
            "1:540-1140",
        ]);
        expect(lastUndo().words).toBe("Lunch break removed. Saved.");
        await press(button(/^Add another shift/));
        await settle();
        expect(sent().filter((r) => r.startsWith("1:"))).toEqual([
            "1:1200-1320",
            "1:540-1140",
        ]);
        expect(lastUndo().words).toBe("Shift added: 8 to 10 pm. Saved.");
        expect(hasButton("Remove the 8 to 10 pm shift")).toBe(true);
    });

    it("uses Monday's hours on Saturday and Sunday too, in one save", async () => {
        draw();
        await press(button(/^Monday, 9 am to 7 pm/));
        expect(button("Monday, this day").disabled).toBe(true);
        await press(button("Saturday"));
        await press(button("Sunday"));
        await press(button("Use on 2 more days"));
        await settle();
        expect(actions.replaceStaffHours).toHaveBeenCalledTimes(1);
        expect(sent().filter((r) => /^[06]:/.test(r))).toEqual([
            "0:540-780",
            "0:900-1140",
            "6:540-780",
            "6:900-1140",
        ]);
        expect(lastUndo().words).toBe(
            "Monday's hours now also on 2 more days. Saved.",
        );
    });
});

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("Change several days %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    it("sets Monday to Friday with lunch in one save and one toast", async () => {
        draw({ person: "st_arjun" });
        await press(button("Mon to Fri"));
        expect(dialog()?.textContent).toContain(
            "Same hours on every day you pick, for Arjun.",
        );
        expect(dialog()?.textContent).toContain(
            "This replaces the hours on Mon, Tue, Wed, Thu, Fri.",
        );
        await press(switchNamed("Lunch break"));
        await press(button("Apply to 5 days"));
        await settle();
        expect(actions.replaceStaffHours).toHaveBeenCalledTimes(1);
        expect(sent()).toContain("1:600-780");
        expect(sent()).toContain("5:840-1080");
        expect(toast.showUndo).toHaveBeenCalledTimes(1);
        expect(lastUndo().words).toBe(
            "Mon, Tue, Wed, Thu, Fri: 10 am to 6 pm, lunch 1 to 2 pm. Saved.",
        );
        expect(dialog()).toBeNull();
    });

    it("asks for a day when none is picked, and saves nothing", async () => {
        draw();
        await press(button("Choose days"));
        expect(dialog()?.textContent).toContain("Pick the days to change.");
        await press(button("Apply"));
        expect(dialog()?.querySelector("[role=alert]")?.textContent).toBe(
            "Pick at least one day.",
        );
        expect(actions.replaceStaffHours).not.toHaveBeenCalled();
    });
});

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("time off %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    function type(id: string, value: string) {
        const inputs = Array.from(
            document.body.querySelectorAll<HTMLInputElement>("[data-day]"),
        );
        const input = inputs.at(id === "from" ? 0 : 1);
        if (!input) throw new Error(`No ${id} day`);
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    it("adds 30 Dec to 2 Jan, keeps the 2 bookings in it, and Undo takes it off", async () => {
        draw();
        actions.previewOff.mockResolvedValue({
            ok: true,
            data: { affected: [{ id: "b1" }, { id: "b2" }] },
        });
        actions.addTimeOff.mockResolvedValue({
            ok: true,
            data: {
                staff: {
                    ...MEERA,
                    timeOff: [
                        ...MEERA.timeOff,
                        { ...MEERA.timeOff[0], id: "t_new" },
                    ],
                },
                affected: [{ id: "b1" }, { id: "b2" }],
            },
        });
        await press(button("Add time off"));
        expect(dialog()?.textContent).toContain("Someone is away");
        expect(dialog()?.textContent).toContain("The business is closed");
        type("from", "2026-12-30");
        type("to", "2027-01-02");
        expect(dialog()?.textContent).toContain("4 days.");
        await act(async () => {
            await new Promise((r) => setTimeout(r, 300));
        });
        expect(said(dialog())).toContain(
            "2 bookings fall in this time. They stay booked. See them",
        );
        const see = Array.from(dialog()?.querySelectorAll("a") ?? []).find(
            (a) => a.textContent === "See them",
        );
        expect(see?.getAttribute("href")).toBe(
            "/bookings?date=2026-12-30&layout=agenda&person=st_meera",
        );
        const add = Array.from(
            dialog()?.querySelectorAll<HTMLButtonElement>(
                "button[type=submit]",
            ) ?? [],
        ).find((b) => b.textContent === "Add time off");
        if (!add) throw new Error("No Add time off button");
        await press(add);
        await settle();
        expect(actions.addTimeOff).toHaveBeenCalledWith("st_meera", {
            fromDate: "2026-12-30",
            toDate: "2027-01-02",
            reason: undefined,
        });
        const { words, undo } = lastUndo();
        expect(words).toBe("Time off added. 2 bookings in it stay booked.");
        actions.removeTimeOffMany.mockResolvedValue({ ok: true, data: MEERA });
        await act(async () => {
            await undo();
        });
        expect(actions.removeTimeOffMany).toHaveBeenCalledWith("st_meera", [
            "t_new",
        ]);
    });

    it("closes the whole business, for those who may", async () => {
        draw();
        actions.addClosure.mockResolvedValue({
            ok: true,
            data: {
                closures: [{ ...MEERA.timeOff[0], id: "c_new" }],
                affected: [],
            },
        });
        await press(button("Add time off"));
        await press(radio("The business is closed"));
        expect(dialog()?.textContent).toContain(
            "Nobody at Kaya Physio can be booked.",
        );
        expect(dialog()?.textContent).not.toContain("Who");
        const add = Array.from(
            dialog()?.querySelectorAll<HTMLButtonElement>(
                "button[type=submit]",
            ) ?? [],
        ).find((b) => b.textContent === "Add time off");
        if (!add) throw new Error("No Add time off button");
        await press(add);
        await settle();
        expect(actions.addClosure).toHaveBeenCalledWith(
            expect.objectContaining({ reason: "Closed" }),
        );
        expect(lastUndo().words).toBe("Time off added.");
    });

    it("removes a time off with Undo, which adds it back", async () => {
        draw();
        actions.removeTimeOffMany.mockResolvedValue({ ok: true, data: MEERA });
        await press(button(/^Meera · 27 to 29 Oct/));
        expect(dialog()?.textContent).toContain("Someone is away");
        expect(dialog()?.textContent).toContain("Leave");
        await press(button("Remove this time off"));
        await settle();
        expect(actions.removeTimeOffMany).toHaveBeenCalledWith("st_meera", [
            "t1",
        ]);
        const { words, undo } = lastUndo();
        expect(words).toBe("Time off removed.");
        actions.addTimeOff.mockResolvedValue({
            ok: true,
            data: { staff: MEERA, affected: [] },
        });
        await act(async () => {
            await undo();
        });
        expect(actions.addTimeOff).toHaveBeenCalledWith(
            "st_meera",
            expect.objectContaining({
                fromDate: "2026-10-27",
                toDate: "2026-10-29",
                reason: "Leave",
            }),
        );
    });
});

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("More %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    it("closes extra opening hours, keeping the bookings, with Undo", async () => {
        draw();
        actions.removeExtraHours.mockResolvedValue({
            ok: true,
            data: { staff: MEERA, outside: [] },
        });
        await press(button(/^Extra opening hours/));
        expect(said(dialog())).toContain("Sat 24 Oct · 2 to 5 pm");
        expect(said(dialog())).toContain(
            "3 bookings in it stay if you close these",
        );
        await press(button("Close extra hours Sat 24 Oct · 2 to 5 pm"));
        await settle();
        expect(actions.removeExtraHours).toHaveBeenCalledWith("st_meera", "x1");
        expect(lastUndo().words).toBe(
            "Extra hours on Sat 24 Oct closed. The 3 bookings stay.",
        );
        expect(said(dialog())).toContain("No extra hours coming up");
    });

    it("adds extra hours there, without going to the calendar", async () => {
        draw();
        actions.addExtraHours.mockResolvedValue({
            ok: true,
            data: {
                ...MEERA,
                extraHours: [
                    ...MEERA.extraHours,
                    {
                        id: "x_new",
                        date: "2026-10-20",
                        startMinute: 600,
                        endMinute: 840,
                    },
                ],
            },
        });
        await press(button(/^Extra opening hours/));
        await press(button("Add extra hours"));
        await press(button("Add these hours"));
        await settle();
        expect(actions.addExtraHours).toHaveBeenCalledWith("st_meera", {
            date: "2026-10-20",
            startMinute: 600,
            endMinute: 840,
        });
        expect(lastUndo().words).toBe(
            "Extra hours added: Tue 20 Oct, 10 am to 2 pm.",
        );
    });

    it("saves a booking rule as soon as it is picked, with Undo", async () => {
        draw();
        actions.updateBookingRules.mockResolvedValue({
            ok: true,
            data: { ...MEERA, freeCancelHours: 2 },
        });
        await press(button(/^Booking rules, Whole business/));
        expect(dialog()?.textContent).toContain(
            "For the whole business. Each saves as soon as you pick.",
        );
        expect(dialog()?.textContent).toContain("Gap between bookings");
        await press(button(/^Cancelling:/));
        await press(radio("2 hours before"));
        await settle();
        expect(actions.updateBookingRules).toHaveBeenCalledWith({
            freeCancelHours: 2,
        });
        expect(lastUndo().words).toBe("Cancelling: 2 hours before. Saved.");
        expect(dialog()?.textContent).toContain("Booking rules");
    });

    it("shows what customers see, and why a time isn't offered", async () => {
        draw();
        await press(button(/^What customers see/));
        expect(dialog()?.textContent).toContain(
            "Times your booking page offers with Meera.",
        );
        expect(actions.readOffered).toHaveBeenCalledWith(
            "sv_assess",
            "st_meera",
        );
        await press(button("Why isn't a time offered?"));
        expect(dialog()?.textContent).toContain(
            "A time shows on your booking page only when all of these are true:",
        );
        expect(dialog()?.querySelector("a")?.getAttribute("href")).toBe(
            "/settings/organization?section=hours",
        );
    });
});
