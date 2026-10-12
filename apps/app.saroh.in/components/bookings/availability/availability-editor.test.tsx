// @vitest-environment jsdom
/**
 * Bookings › Availability. With nobody on the diary the screen still
 * answers "when can people book?": "It's just me" and "Add my team", the
 * week customers can book today, and the booking rules (UX-022). The rules
 * are sentences in rows; Edit opens a sheet that saves that one rule with
 * a toast and Undo, and never raises the page's unsaved bar, which hours
 * and time off still do.
 *
 * `react-dom/client` + `act` directly, as the screen's other tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, actions, toast } = vi.hoisted(() => ({
    refresh: vi.fn(),
    actions: {
        addClosure: vi.fn(),
        addExtraHours: vi.fn(),
        addTimeOff: vi.fn(),
        removeClosures: vi.fn(),
        removeExtraHours: vi.fn(),
        removeTimeOffMany: vi.fn(),
        replaceStaffHours: vi.fn(),
        updateBookingRules: vi.fn(),
        updateStaff: vi.fn(),
        addMyself: vi.fn(),
        addPerson: vi.fn(),
        previewOff: vi.fn(),
        readOffered: vi.fn(),
    },
    toast: {
        showUndo: vi.fn(),
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
    },
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("@/lib/staff/actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);

import { mayNavigate } from "@/lib/nav/leave-request";
import type { BookingRules, StaffView, WeeklyRange } from "@/lib/staff/types";

import {
    AvailabilityEditor,
    joinedText,
    savedText,
    unsavedText,
} from "./availability-editor";
import { RULE_SAVED } from "./booking-rules-card";

const RULES: BookingRules = {
    bookAheadDays: 56,
    latestBookingMinutes: null,
    freeCancelHours: 12,
    refundInTimeCancels: true,
    bookingPayment: "BOTH",
};

/** Monday to Friday, 9 to 5: what the services' own hours come to. */
const NINE_TO_FIVE: WeeklyRange[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 540,
    endMinute: 1020,
}));

const ASHA: StaffView = {
    id: "st_asha",
    name: "Asha",
    title: null,
    status: "ACTIVE",
    membership: null,
    serviceIds: [],
    hours: NINE_TO_FIVE,
    weeklyMinutes: 2400,
    extraHours: [],
    timeOff: [],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const m of [...Object.values(actions), ...Object.values(toast)]) {
        m.mockReset();
    }
    refresh.mockReset();
    actions.readOffered.mockResolvedValue({ ok: false, why: "failed" });
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function draw(
    over: Partial<Parameters<typeof AvailabilityEditor>[0]> = {},
): void {
    act(() =>
        root.render(
            <AvailabilityEditor
                staff={[]}
                closures={[]}
                openingHours={NINE_TO_FIVE}
                rules={RULES}
                serviceHours={NINE_TO_FIVE}
                timezone="Asia/Kolkata"
                today="2026-10-07"
                kept={[]}
                bookedOn={{}}
                takesClasses={[]}
                canEdit
                onlineBlocker={null}
                {...over}
            />,
        ),
    );
}

const text = () => host.textContent;
const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
function button(name: string, within: ParentNode | null = host) {
    const hit = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
}
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}
const rule = (key: string) =>
    host.querySelector(`[data-rule="${key}"]`)?.textContent;
const unsavedBar = () =>
    Array.from(host.querySelectorAll('[role="status"]')).find((el) =>
        el.textContent.startsWith("Unsaved"),
    );

describe("Availability with nobody on the diary", () => {
    it("asks the question and offers the two ways in, yourself first", () => {
        draw();
        expect(text()).toContain("When can people book you?");
        expect(text()).toContain(
            "Put yourself on the diary with your opening hours, or add your team.",
        );
        const names = Array.from(
            host.querySelectorAll(
                "#availability-start ~ * button, section button",
            ),
        ).map((b) => b.textContent);
        expect(names.indexOf("It's just me")).toBeGreaterThan(-1);
        expect(names.indexOf("It's just me")).toBeLessThan(
            names.indexOf("Add my team"),
        );
        // No longer an empty state that asks for "someone".
        expect(text()).not.toContain("No one takes bookings yet");
        expect(text()).not.toContain("Add someone");
    });

    it("says a starting week, not opening hours, when the business has none", () => {
        draw({ openingHours: null });
        expect(text()).toContain(
            "Put yourself on the diary with a starting week, or add your team.",
        );
    });

    it("says the week customers can book today, from the services' own hours", () => {
        draw();
        const week = host.querySelector('[data-testid="bookable-week"]');
        expect(
            Array.from(week?.children ?? []).map((row) =>
                Array.from(row.children).map((c) => c.textContent),
            ),
        ).toEqual([
            ["Monday to Friday", "9:00 am to 5:00 pm"],
            ["Saturday and Sunday", "Not bookable"],
        ]);
    });

    it("says so when no service has hours to book in", () => {
        draw({ serviceHours: null });
        expect(text()).toContain(
            "Nothing yet. No service on your booking page has hours.",
        );
        expect(host.querySelector('[data-testid="bookable-week"]')).toBeNull();
    });

    it("still shows the booking rules, as sentences (UX-022)", () => {
        draw();
        expect(host.querySelector("h2#booking-rules")?.textContent).toBe(
            "Booking rules",
        );
        expect(rule("bookAheadDays")).toBe("Book up to 8 weeks ahead");
        expect(rule("latestBookingMinutes")).toBe("Book up to the start time");
        expect(rule("freeCancelHours")).toBe(
            "Free to cancel up to 12 hours before",
        );
        expect(rule("bookingPayment")).toBe("Pay online or at the desk");
        expect(rule("refundInTimeCancels")).toBe(
            "Cancelled in time: refund what they paid online",
        );
        // Read first: no dropdown on the page.
        expect(host.querySelector('[role="combobox"], select')).toBeNull();
    });

    it("says it can't be changed to a role that can't, with nothing to press", () => {
        draw({ canEdit: false });
        expect(text()).toContain(
            "Your role can see these rules but not change them.",
        );
        expect(text()).toContain("Nobody is on the diary yet.");
        expect(host.querySelectorAll("button")).toHaveLength(0);
        // The week and the rules are still read.
        expect(text()).toContain("Monday to Friday");
        expect(rule("bookingPayment")).toBe("Pay online or at the desk");
    });

    it("says when the rules couldn't be read, and offers no Edit on a guess", () => {
        draw({ rules: null });
        expect(text()).toContain("Couldn't load the booking rules");
        expect(host.querySelector("[data-rule]")).toBeNull();
    });
});

describe("It's just me", () => {
    it("puts the signed-in person on the diary in one press, with Undo", async () => {
        actions.addMyself.mockResolvedValue({
            ok: true,
            data: { staff: { ...ASHA, id: "st_me" }, week: "opening" },
        });
        actions.updateStaff.mockResolvedValue({ ok: true, data: ASHA });
        draw();
        await press(button("It's just me"));
        // One press: no dialog, no name to type.
        expect(sheet()).toBeNull();
        expect(actions.addMyself).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalled();
        const [said, undo, options] = toast.showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
            { description: string },
        ];
        expect(said).toBe("You're on the diary with your opening hours.");
        expect(options.description).toBe(
            "Your week is below. Change it any time.",
        );
        // Undo takes them off the diary again.
        await expect(undo()).resolves.toEqual({ ok: true });
        expect(actions.updateStaff).toHaveBeenCalledWith("st_me", {
            status: "ARCHIVED",
        });
    });

    it("says a starting week when there were no opening hours to use", () => {
        expect(joinedText("default")).toBe(
            "You're on the diary with a starting week.",
        );
    });

    it("says a refusal and leaves the screen as it was", async () => {
        actions.addMyself.mockResolvedValue({
            ok: false,
            error: "Your role can't change the diary.",
        });
        draw();
        await press(button("It's just me"));
        expect(toast.showError).toHaveBeenCalledWith(
            "Your role can't change the diary.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(text()).toContain("When can people book you?");
    });

    it("opens the add-person dialog from Add my team", async () => {
        draw();
        await press(button("Add my team"));
        expect(sheet()?.textContent).toContain("New person who takes bookings");
        expect(sheet()?.textContent).toContain(
            "They start with your opening hours.",
        );
        expect(actions.addMyself).not.toHaveBeenCalled();
    });
});

describe("Booking rules: a row each, saved in its own sheet", () => {
    it("opens the rule's sheet with the choices it always had", async () => {
        draw();
        await press(button("Edit: How far ahead people can book"));
        expect(sheet()?.textContent).toContain("How far ahead people can book");
        expect(
            Array.from(sheet()?.querySelectorAll('[role="radio"]') ?? []).map(
                (r) => r.closest("label")?.textContent,
            ),
        ).toEqual(["1 week", "2 weeks", "4 weeks", "8 weeks", "No limit"]);
        expect(
            sheet()?.querySelector('[role="radio"][aria-checked="true"]')
                ?.parentElement?.textContent,
        ).toBe("8 weeks");
    });

    it("keeps the help each way of paying had", async () => {
        draw({ onlineBlocker: "NO_PROVIDER" });
        await press(button("Edit: How people pay when they book"));
        expect(sheet()?.textContent).toContain(
            "Nobody pays on the booking page. They pay when they come, a deposit too.",
        );
        expect(sheet()?.textContent).toContain(
            "Right now no payment provider is connected, so nobody can book a service with a price online.",
        );
    });

    it("saves that one rule by itself, with a toast and Undo, and no unsaved bar", async () => {
        actions.updateBookingRules.mockImplementation(
            (patch: Partial<BookingRules>) =>
                Promise.resolve({ ok: true, data: { ...RULES, ...patch } }),
        );
        draw();
        await press(button("Edit: How far ahead people can book"));
        const noLimit = Array.from(
            sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        ).at(-1);
        if (!noLimit) throw new Error("No choices");
        await press(noLimit);
        // Choosing is not saving, and nothing on the page is waiting.
        expect(actions.updateBookingRules).not.toHaveBeenCalled();
        expect(unsavedBar()).toBeUndefined();

        await press(button("Save", sheet()));
        // Only the rule that changed is sent.
        expect(actions.updateBookingRules).toHaveBeenCalledWith({
            bookAheadDays: null,
        });
        expect(rule("bookAheadDays")).toBe("No limit on how far ahead");
        expect(unsavedBar()).toBeUndefined();
        expect(button("Edit: How far ahead people can book")).toBeTruthy();
        expect(() => button("Save")).toThrow();

        const [said, undo] = toast.showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(said).toBe(RULE_SAVED);
        expect(said).not.toMatch(/Hours saved/);
        // Undo puts back that one rule.
        await act(async () => {
            await undo();
        });
        expect(actions.updateBookingRules).toHaveBeenLastCalledWith({
            bookAheadDays: 56,
        });
        expect(rule("bookAheadDays")).toBe("Book up to 8 weeks ahead");
    });

    it("keeps the sheet open with what was chosen when the save is refused", async () => {
        actions.updateBookingRules.mockResolvedValue({
            ok: false,
            error: "Couldn't save the booking rules.",
        });
        draw();
        await press(button("Edit: Cancelled in time"));
        const keep = Array.from(
            sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        ).at(-1);
        if (!keep) throw new Error("No choices");
        await press(keep);
        await press(button("Save", sheet()));
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save the booking rules.",
        );
        expect(sheet()).not.toBeNull();
        expect(keep.getAttribute("aria-checked")).toBe("true");
        expect(rule("refundInTimeCancels")).toBe(
            "Cancelled in time: refund what they paid online",
        );
    });
});

describe("Availability with people on the diary", () => {
    it("asks before a way off the page loses unsaved hours", async () => {
        draw({ staff: [ASHA] });
        // Nothing unsaved: a way off is not held.
        expect(mayNavigate("/services")).toBe(true);
        await press(button("Bookable on Monday"));
        let free = true;
        await act(async () => {
            free = mayNavigate("/services");
            await new Promise((r) => setTimeout(r, 20));
        });
        // Held, and the question is on screen to answer: without it the
        // link would just do nothing.
        expect(free).toBe(false);
        const ask = document.body.querySelector('[role="alertdialog"]');
        expect(ask?.textContent).toContain("Leave without saving?");
        expect(ask?.textContent).toContain(
            "Your changes to hours or time off aren't saved, and will be lost.",
        );
    });

    it("puts the rules under the week, and What customers see beside it", () => {
        draw({ staff: [ASHA] });
        const week = host.querySelector("#weekly-hours");
        const rules = host.querySelector("#booking-rules");
        const preview = Array.from(host.querySelectorAll("h2")).find(
            (h) => h.textContent === "What customers see",
        );
        expect(week && rules && preview).toBeTruthy();
        if (!week || !rules || !preview) return;
        // Document order: the week, the preview, then the rules.
        expect(
            week.compareDocumentPosition(preview) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            preview.compareDocumentPosition(rules) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // The rules are not in the week's row of columns.
        expect(week.closest("section")?.parentElement).not.toBe(
            rules.closest("section")?.parentElement,
        );
    });

    it("raises the unsaved bar for hours, and says what Save will do", async () => {
        draw({ staff: [ASHA] });
        expect(unsavedBar()).toBeUndefined();
        await press(button("Bookable on Monday"));
        expect(unsavedBar()?.textContent).toBe(unsavedText());
        expect(unsavedText()).toMatch(/New free times show on the calendar/);
        expect(unsavedText()).not.toMatch(/rules/);
        expect(savedText()).toBe(
            "Saved. The calendar and booking page use them now.",
        );
    });

    it("does not raise it for a rule saved while hours are untouched", async () => {
        actions.updateBookingRules.mockResolvedValue({
            ok: true,
            data: { ...RULES, bookingPayment: "DESK" },
        });
        draw({ staff: [ASHA] });
        await press(button("Edit: How people pay when they book"));
        const desk = Array.from(
            sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        ).at(-1);
        if (!desk) throw new Error("No choices");
        await press(desk);
        await press(button("Save", sheet()));
        expect(rule("bookingPayment")).toBe("Pay at the desk");
        expect(unsavedBar()).toBeUndefined();
        expect(actions.replaceStaffHours).not.toHaveBeenCalled();
    });

    it("says they take no service when none on the booking page is theirs", () => {
        draw({ staff: [ASHA], services: [{ id: "svc_1", name: "Cut" }] });
        expect(text()).toContain("Asha takes no service on the booking page");
        expect(actions.readOffered).not.toHaveBeenCalled();
    });

    it("shows the times the booking page offers for a service they take", async () => {
        actions.readOffered.mockResolvedValue({
            ok: true,
            data: {
                timezone: "Asia/Kolkata",
                kind: "one",
                days: [
                    {
                        date: "2026-10-07",
                        open: true,
                        closed: false,
                        starts: [],
                    },
                    {
                        date: "2026-10-08",
                        open: true,
                        closed: false,
                        starts: [
                            {
                                // 9:00 am and 9:30 am in Kolkata.
                                startAt: "2026-10-08T03:30:00.000Z",
                                endAt: "2026-10-08T04:00:00.000Z",
                                staffId: "st_asha",
                                staffName: "Asha",
                                placesLeft: null,
                            },
                            {
                                startAt: "2026-10-08T04:00:00.000Z",
                                endAt: "2026-10-08T04:30:00.000Z",
                                staffId: "st_asha",
                                staffName: "Asha",
                                placesLeft: null,
                            },
                        ],
                    },
                ],
            },
        });
        draw({
            staff: [{ ...ASHA, serviceIds: ["svc_1"] }],
            services: [{ id: "svc_1", name: "Cut" }],
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        // The booking page's own read, for this person.
        expect(actions.readOffered).toHaveBeenCalledWith("svc_1", "st_asha");
        // Today has nothing: the next day with a time is shown.
        const times = host.querySelector('ul[aria-label^="Times offered on"]');
        expect(times?.getAttribute("aria-label")).toContain("Thursday");
        expect(
            Array.from(times?.children ?? []).map((li) => li.textContent),
        ).toEqual(["9:00 am", "9:30 am"]);
    });
});
