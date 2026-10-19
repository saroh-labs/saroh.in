// @vitest-environment jsdom
/**
 * Bookings › Hours and time off, V2 (U17, DEC-170), at a phone's width and
 * a desk's: the Whose hours card over a calm weekly list, time off and
 * More beside it on a desk and under it on a phone, the first-time card,
 * and who may change what — a Member changes anyone's hours but adds
 * nobody, Calendar only reads. There is no Save bar and no draft, so
 * leaving never asks. The sheets' own saves are `hours-sheets.test.tsx`.
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

import { mayNavigate } from "@/lib/nav/leave-request";

import type { EditorProps } from "./hours.test-kit";
import {
    ARJUN,
    MEERA,
    NEHA,
    button,
    dialog,
    drawEditor,
    hasButton,
    press,
    radio,
    said,
    setWidth,
} from "./hours.test-kit";
import { MEMBER_LINE } from "./whose-hours";

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
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const draw = (over: Partial<EditorProps> = {}) => drawEditor(root, over);

/** The weekly list's rows, as each says itself to a screen reader. */
const rows = () =>
    Array.from(
        host.querySelectorAll<HTMLElement>(
            "section[aria-labelledby=weekly-hours] li",
        ),
    ).map((li) => said(li).trim());

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("Hours and time off %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    it("opens on the person in ?person=, with their week as a calm list", () => {
        draw({ person: "st_arjun" });
        expect(said(host)).toContain("Whose hours");
        expect(said(host)).toContain("Arjun Rao · Sports therapist");
        expect(said(host)).toContain("44 hours a week");
        expect(rows()).toEqual([
            "Monday10 am to 6 pm",
            "Tuesday10 am to 6 pm",
            "Wednesday10 am to 6 pm",
            "Thursday10 am to 6 pm",
            "Friday10 am to 6 pm",
            "Saturday10 am to 2 pm",
            "SundayClosed",
        ]);
        // Each row opens its day, and says whose it is.
        expect(
            button("Monday, 10 am to 6 pm. Change Arjun's hours"),
        ).toBeTruthy();
    });

    it("opens on the first person with no ?person=, lunch under the hours", () => {
        draw();
        expect(said(host)).toContain("Meera Iyer · Physiotherapist");
        expect(rows()[0]).toBe("Monday9 am to 7 pmLunch 1 to 3 pm");
        expect(rows()[6]).toBe("SundayClosed");
    });

    it("says a split day's second shift under its first", () => {
        draw({ person: "st_neha" });
        expect(rows()[0]).toBe("Monday7 to 11 amand 5 to 8 pm");
        expect(rows()[1]).toBe("TuesdayClosed");
    });

    it("has no Save bar, and leaving never asks: there is no draft", () => {
        draw();
        expect(hasButton("Save")).toBe(false);
        expect(hasButton("Discard")).toBe(false);
        expect(said(host)).toContain(
            "Changes save as you make them, with Undo.",
        );
        expect(mayNavigate("/bookings")).toBe(true);
    });

    it("holds time off and More, with the slot for each person's rules between", () => {
        draw({ personRules: <p>Booking rules for Meera</p> });
        const sections = Array.from(
            host.querySelectorAll("section[aria-labelledby], [data-slot]"),
        ).map(
            (el) =>
                el.getAttribute("aria-labelledby") ??
                el.getAttribute("data-slot"),
        );
        expect(sections).toEqual([
            "weekly-hours",
            "time-off",
            "person-rules",
            "hours-more",
        ]);
        expect(said(host)).toContain("Meera · 27 to 29 Oct");
        expect(said(host)).toContain("Leave · all day · 3 days");
        expect(said(host)).toContain("Extra opening hours");
        expect(said(host)).toContain("1 coming up");
        expect(said(host)).toContain("What customers see");
        expect(said(host)).toContain("Whole business");
    });

    it("says a booking the hours leave out stays booked, with See it", () => {
        draw({
            kept: [
                {
                    id: "b1",
                    staffId: "st_meera",
                    weekday: 6,
                    start: 15 * 60,
                    who: "Sana Qureshi",
                    date: "2026-10-24",
                    href: "/bookings/b1",
                },
            ],
        });
        const note = Array.from(host.querySelectorAll("[role=status]")).find(
            (el) => said(el).includes("Sana Qureshi"),
        );
        expect(said(note)).toContain(
            "Sana Qureshi is booked on Sat 24 Oct at 3:00 pm. It stays booked.",
        );
        expect(note?.querySelector("a")?.getAttribute("href")).toBe(
            "/bookings/b1",
        );
    });

    it("picks whose hours from the card, and keeps it in the address", async () => {
        draw();
        await press(button(/Whose hours/));
        expect(dialog()?.textContent).toContain("Whose hours?");
        expect(dialog()?.textContent).toContain(
            "Add someone who takes bookings",
        );
        await press(radio("Everyone"));
        expect(router.replace).toHaveBeenCalledWith(
            "/bookings/availability?person=all",
            { scroll: false },
        );
        expect(said(host)).toContain("Everyone · the whole team");
        expect(said(host)).toContain("3 people");
        // Everyone's week: from the first in to the last out, and who works.
        expect(rows()[0]).toBe("Monday7 am to 8 pmMeera, Arjun, Neha");
        // The chips change one person's days, not everyone's.
        expect(hasButton("Mon to Fri")).toBe(false);
    });

    it("opens everyone's day, and a person's day from it", async () => {
        draw({ person: "all" });
        await press(button(/^Monday, 7 am to 8 pm/));
        expect(dialog()?.textContent).toContain("Who works, and when.");
        expect(dialog()?.textContent).toContain(
            phone ? "Tap a person" : "Click a person",
        );
        await press(button(/^Arjun Rao: 10 am to 6 pm/));
        expect(dialog()?.textContent).toContain(
            "Arjun's hours · saves as you change it",
        );
        expect(dialog()?.textContent).toContain("Open on Monday");
    });

    it("draws each sheet from the foot of a phone, at the right of a desk", async () => {
        draw();
        await press(button(/^Saturday, 9 am to 1 pm/));
        const panel = document.body.querySelector("[data-hours-panel]");
        expect(panel?.className.includes("rounded-t-[18px]")).toBe(phone);
        // At a desk the row being changed stays marked beside its panel.
        const row = button(/^Saturday, 9 am to 1 pm/);
        expect(row.hasAttribute("data-selected")).toBe(!phone);
    });

    it("gives the keyboard back to the day's row when its sheet closes", async () => {
        draw();
        const row = button(/^Saturday, 9 am to 1 pm/);
        row.focus();
        await press(row);
        expect(dialog()).not.toBeNull();
        await act(async () => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(dialog()).toBeNull();
        expect(document.activeElement).toBe(button(/^Saturday, 9 am to 1 pm/));
    });
});

describe("who may change what", () => {
    beforeEach(() => setWidth(false));

    it("a Member changes anyone's hours and time off, and adds nobody", async () => {
        draw({ canManage: false, person: "st_arjun" });
        expect(said(host)).toContain(MEMBER_LINE);
        // Their hours are theirs to change, anyone's.
        await press(button(/^Monday, 10 am to 6 pm/));
        expect(dialog()?.textContent).toContain("Open on Monday");
        act(() => root.unmount());
        root = createRoot(host);
        draw({ canManage: false });
        await press(button(/Whose hours/));
        expect(dialog()?.textContent).not.toContain(
            "Add someone who takes bookings",
        );
        expect(hasButton("Add time off")).toBe(true);
    });

    it("a Member adds time off for someone, but can't close the business", async () => {
        draw({ canManage: false });
        await press(button("Add time off"));
        expect(dialog()?.textContent).toContain("Add time off");
        expect(dialog()?.textContent).not.toContain("The business is closed");
    });

    it("Calendar only reads the hours, and is told so in one line", async () => {
        draw({ canEdit: false, canManage: false });
        expect(said(host)).toContain(
            "Your role can see these hours but not change them.",
        );
        expect(said(host)).not.toContain(MEMBER_LINE);
        expect(hasButton(/^Monday, 9 am to 7 pm/)).toBe(false);
        expect(rows()[0]).toContain("Monday");
        expect(hasButton("Add time off")).toBe(false);
        expect(hasButton("Mon to Fri")).toBe(false);
        await press(button(/^Extra opening hours/));
        expect(dialog()?.textContent).toContain("Sat 24 Oct · 2 to 5 pm");
        expect(hasButton("Add extra hours", dialog() ?? undefined)).toBe(false);
        expect(hasButton(/^Close extra hours/, dialog() ?? undefined)).toBe(
            false,
        );
    });

    it("an owner's business rules are read-only to everyone else", async () => {
        draw({ canManage: false });
        await press(button(/^Booking rules, Whole business/));
        expect(dialog()?.textContent).toContain(
            "Only owners and admins change the business's rules.",
        );
        expect(hasButton(/^Cancelling:/, dialog() ?? undefined)).toBe(false);
    });
});

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("nobody's hours set yet, %s", (_scene, phone) => {
    beforeEach(() => setWidth(phone));

    it("asks when customers can book them, with the week they'd start with", () => {
        draw({ staff: [], serviceHours: MEERA.hours });
        expect(said(host)).toContain("When can customers book Mohit?");
        expect(said(host)).toContain(
            "Nobody's hours are set yet. Start with these, then change any day.",
        );
        expect(said(host)).toContain("Monday to Saturday10 am to 7 pm");
        expect(said(host)).toContain("SundayClosed");
        expect(said(host)).toContain(
            "Each service is booked in its own hours. Together they cover Mon to Fri 9 am to 1 pm and 3 to 7 pm, and Sat 9 am to 1 pm.",
        );
        expect(hasButton("Set Mohit's hours")).toBe(true);
        expect(hasButton("Choose different hours")).toBe(true);
        expect(hasButton(/^Add someone else who takes bookings/)).toBe(true);
        expect(hasButton(/^Booking rules, Whole business/)).toBe(true);
    });

    it("sets their hours in one press, with Undo taking them off again", async () => {
        draw({ staff: [] });
        actions.addMyself.mockResolvedValue({
            ok: true,
            data: {
                staff: {
                    ...MEERA,
                    id: "st_me",
                    name: "Mohit Mehta",
                    hours: [],
                },
                week: "opening",
            },
        });
        await press(button("Set Mohit's hours"));
        expect(actions.addMyself).toHaveBeenCalledWith(undefined);
        const [said0, undo] = toast.showUndo.mock.calls.at(-1) as unknown as [
            string,
            () => Promise<unknown>,
        ];
        expect(said0).toMatch(/^Mohit's hours are set: /);
        actions.updateStaff.mockResolvedValue({ ok: true, data: MEERA });
        await act(async () => {
            await undo();
        });
        expect(actions.updateStaff).toHaveBeenCalledWith("st_me", {
            status: "ARCHIVED",
        });
    });

    it("chooses different hours in Change several days", async () => {
        draw({ staff: [] });
        await press(button("Choose different hours"));
        expect(dialog()?.textContent).toContain("Change several days");
        expect(dialog()?.textContent).toContain("for Mohit");
    });

    it("says what nothing on the page can be booked in without service hours", () => {
        draw({ staff: [], serviceHours: null });
        expect(said(host)).toContain(
            "No service on your booking page has hours, so nothing can be booked yet.",
        );
    });

    it("tells someone who can't put people on the diary who can", () => {
        draw({ staff: [], canManage: false, canEdit: false });
        expect(said(host)).toContain(
            "Nobody's hours are set yet. An owner or admin puts people on the diary.",
        );
        expect(hasButton("Set Mohit's hours")).toBe(false);
        expect(hasButton(/^Add someone else/)).toBe(false);
    });
});

describe("adding someone who takes bookings", () => {
    beforeEach(() => setWidth(false));

    it("opens the add sheet from whose hours, named on its button", async () => {
        draw();
        await press(button(/Whose hours/));
        await press(button("Add someone who takes bookings"));
        expect(dialog()?.textContent).toContain(
            "They start with your opening hours and don't need a sign-in.",
        );
        expect(hasButton("Add person", dialog() ?? undefined)).toBe(true);
    });

    it("keeps the people the rest of the screen reads", () => {
        draw({
            staff: [
                MEERA,
                ARJUN,
                NEHA,
                { ...NEHA, id: "st_old", status: "ARCHIVED" },
            ],
        });
        expect(said(host)).not.toContain("st_old");
    });
});
