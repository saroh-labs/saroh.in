// @vitest-environment jsdom
/**
 * Change who a booking is with, or Assign someone (#1157), on a phone and
 * at a desk: from the quick look's "With" row, its "Move or cancel" step
 * and More, and from a booking's page (More, and the note on a booking
 * with nobody). The list says who is free, booked then (and when) or off,
 * and only someone free can be picked; "Change the time too" reads the
 * list again at the new time; the change is made once its hold ends, and
 * a refusal is said. The hold itself (ten seconds, Undo) and the
 * booking's page are in `booking-detail.test.tsx`.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookingQuickLook } from "@/components/bookings/quick-look/booking-quick-look";
import type {
    QuickLookActions,
    QuickLookContext,
} from "@/components/bookings/quick-look/quick-look-types";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { Block } from "@/lib/services/diary";
import { bookingState } from "@/lib/services/diary";
import type { ReassignCandidate } from "@/lib/services/service";

import { candidateNote, changeWhoSave, changeWhoTitle } from "./change-who";

vi.mock(
    "@/components/shared/undo/use-hold",
    () => import("@/components/shared/undo/hold-now.test-kit"),
);

const readBookingPerson = vi.fn();
const listAvailability = vi.fn();
const readReassignCandidates = vi.fn();
const reassignBooking = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    readBookingPerson: (...a: unknown[]) => readBookingPerson(...a) as unknown,
    listAvailability: (...a: unknown[]) => listAvailability(...a) as unknown,
    readReassignCandidates: (...a: unknown[]) =>
        readReassignCandidates(...a) as unknown,
    reassignBooking: (...a: unknown[]) => reassignBooking(...a) as unknown,
    rescheduleBooking: vi.fn(),
    cancelBooking: vi.fn(),
    readBookingForCancel: vi.fn(),
    bookByHand: vi.fn(),
    bookVisit: vi.fn(),
    takeDeskPayment: vi.fn(),
    createBookingPayLink: vi.fn(),
}));
vi.mock("@/lib/api/http", () => ({}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: {
        href: string;
        children: React.ReactNode;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
    showError: (...a: unknown[]) => showError(...a) as unknown,
    showUndo: vi.fn(() => "toast_1"),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn((fn: () => unknown) => fn()),
}));

const ZONE = "Asia/Kolkata";
// Mon 19 Oct 2026, 9:00 am in India; Kabir is at 11:30.
const NOW = Date.parse("2026-10-19T03:30:00.000Z");
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();

function kabir(over: Partial<DiaryBooking> = {}): DiaryBooking {
    return {
        id: "bk_kabir",
        serviceId: "svc_assess",
        startAt: at("2026-10-19T11:30"),
        endAt: at("2026-10-19T12:15"),
        timezone: ZONE,
        status: "CONFIRMED",
        outcome: null,
        bookerName: "Kabir Singh",
        bookerEmail: "kabir.singh@example.com",
        bookerPhone: null,
        createdAt: "2026-10-01T05:30:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc_assess",
            name: "Physio assessment",
            timezone: ZONE,
            capacity: 1,
            durationMinutes: 45,
            priceCents: 50_000,
            currency: "INR",
        },
        contact: {
            id: "c_kabir",
            firstName: "Kabir",
            lastName: "Singh",
            email: "kabir.singh@example.com",
        },
        staff: { id: "st_asha", name: "Asha Rao" },
        paidWith: "DESK",
        packName: null,
        subscriptionId: null,
        paidAtDesk: null,
        take: null,
        ...over,
    };
}

const PEOPLE: ReassignCandidate[] = [
    { id: "st_asha", name: "Asha Rao", state: "current" },
    { id: "st_meera", name: "Meera Iyer", state: "free" },
    {
        id: "st_ravi",
        name: "Ravi Kumar",
        state: "busy",
        busyFrom: at("2026-10-19T11:00"),
        busyTo: at("2026-10-19T12:00"),
    },
    { id: "st_kiran", name: "Kiran Das", state: "off" },
];

const CTX: QuickLookContext = {
    timezone: ZONE,
    now: NOW,
    money: true,
    rules: null,
    canBook: true,
    notices: null,
};

const acts: QuickLookActions = {
    checkIn: vi.fn(),
    noShow: vi.fn(),
    cancel: vi.fn(),
    cancelClass: vi.fn(),
};

const block = (b: DiaryBooking): Block => ({
    kind: "one",
    key: b.id,
    start: 11 * 60 + 30,
    end: 12 * 60 + 15,
    state: bookingState(b),
    staffId: b.staff?.id ?? null,
    booking: b,
});

function Calendar({ b, ctx }: { b: DiaryBooking; ctx: QuickLookContext }) {
    const [open, setOpen] = useState(true);
    return (
        <BookingQuickLook
            block={open ? block(b) : null}
            onClose={() => setOpen(false)}
            ctx={ctx}
            act={acts}
            heldFor={() => null}
        />
    );
}

let root: Root;
let host: HTMLDivElement;

function size(phone: boolean) {
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
    for (const fn of [
        readBookingPerson,
        listAvailability,
        readReassignCandidates,
        reassignBooking,
        refresh,
        showSuccess,
        showError,
    ]) {
        fn.mockReset();
    }
    readBookingPerson.mockResolvedValue({
        phone: null,
        attention: null,
        reach: "EMAIL",
    });
    listAvailability.mockResolvedValue([]);
    readReassignCandidates.mockResolvedValue({
        startAt: at("2026-10-19T11:30"),
        people: PEOPLE,
    });
    reassignBooking.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function draw(b: DiaryBooking, ctx: QuickLookContext = CTX) {
    await act(async () => {
        root.render(<Calendar b={b} ctx={ctx} />);
        await Promise.resolve();
    });
    await settle();
}

const text = () => document.body.textContent;
const buttons = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
const button = (label: string | RegExp) =>
    buttons().find((b) =>
        typeof label === "string"
            ? b.textContent.trim() === label ||
              b.getAttribute("aria-label") === label
            : label.test(b.textContent.trim()),
    );
async function press(label: string | RegExp) {
    const b = button(label);
    if (!b) throw new Error(`No button ${String(label)}: ${text()}`);
    await act(async () => {
        b.click();
        await Promise.resolve();
    });
    await settle();
}
/** A person's row in the list, by the start of their name. */
const row = (name: string) => {
    const hit = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ).find((b) =>
        document
            .querySelector(`label[for="${b.id}"]`)
            ?.textContent.startsWith(name),
    );
    if (!hit) throw new Error(`No row ${name}: ${text()}`);
    return hit;
};
async function pick(name: string) {
    const r = row(name);
    await act(async () => {
        r.click();
        await Promise.resolve();
    });
    await settle();
}

describe("the words", () => {
    it("asks who it should be with, or who to assign", () => {
        const target = {
            id: "b",
            serviceId: "s",
            serviceName: "Physio assessment",
            startAt: at("2026-10-19T11:30"),
            who: "Kabir Singh",
            staff: { id: "st_asha", name: "Asha Rao" },
        };
        expect(changeWhoTitle(target)).toBe(
            "Change who Kabir's booking is with",
        );
        expect(changeWhoTitle({ ...target, staff: null })).toBe(
            "Assign someone to Kabir's booking",
        );
        expect(changeWhoSave(target, null, null, ZONE)).toBe(
            "Pick who it's with",
        );
        expect(changeWhoSave(target, { name: "Meera Iyer" }, null, ZONE)).toBe(
            "Give it to Meera",
        );
        expect(
            changeWhoSave(
                { ...target, staff: null },
                { name: "Meera Iyer" },
                at("2026-10-19T14:00"),
                ZONE,
            ),
        ).toBe("Assign Meera at 2:00 pm");
    });

    it("says why someone can't take it", () => {
        expect(candidateNote(PEOPLE[1], ZONE)).toBe("Free then");
        expect(candidateNote(PEOPLE[2], ZONE)).toBe(
            "Booked 11:00 am to 12:00 pm",
        );
        expect(candidateNote(PEOPLE[3], ZONE)).toBe("Not working then");
        expect(candidateNote(PEOPLE[0], ZONE)).toBe("With them now");
    });
});

describe.each([
    ["phone", true],
    ["desk", false],
])("Change who in the quick look on a %s", (_name, phone) => {
    beforeEach(() => size(phone));

    it("shows who it is with, and Change opens the list of who is free", async () => {
        await draw(kabir());
        expect(text()).toContain("Asha Rao");
        await press(/^Change/);
        expect(text()).toContain("Change who Kabir's booking is with");
        expect(readReassignCandidates).toHaveBeenCalledWith(
            "bk_kabir",
            undefined,
        );
        expect(text()).toContain("Free then");
        expect(text()).toContain("Booked 11:00 am to 12:00 pm");
        expect(text()).toContain("Not working then");
        // Only someone free can be picked.
        expect(row("Meera Iyer").disabled).toBe(false);
        expect(row("Ravi Kumar").disabled).toBe(true);
        expect(row("Kiran Das").disabled).toBe(true);
        expect(row("Asha Rao").disabled).toBe(true);
        expect(button("Pick who it's with")?.disabled).toBe(true);
    });

    it("gives it to Meera, keeping the time, and says so", async () => {
        await draw(kabir());
        await press(/^Change/);
        await pick("Meera Iyer");
        await press("Give it to Meera");
        expect(reassignBooking).toHaveBeenCalledWith("bk_kabir", {
            staffId: "st_meera",
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Kabir's booking is now with Meera.",
            undefined,
        );
        expect(refresh).toHaveBeenCalled();
        // The quick look closed: the change finished where it was opened.
        expect(document.querySelector("[data-quick-look]")).toBeNull();
    });

    it("says a refusal and changes nothing on screen", async () => {
        reassignBooking.mockResolvedValue({
            ok: false,
            error: "Meera Iyer is already booked from 11:00 am to 12:00 pm. Pick someone else or another time.",
        });
        await draw(kabir());
        await press(/^Change/);
        await pick("Meera Iyer");
        await press("Give it to Meera");
        expect(showError).toHaveBeenCalledWith(
            "Who it's with wasn't changed.",
            "Meera Iyer is already booked from 11:00 am to 12:00 pm. Pick someone else or another time.",
        );
        expect(showSuccess).not.toHaveBeenCalled();
    });

    it("changes the time too, reading who is free then", async () => {
        listAvailability.mockResolvedValue([
            {
                startAt: at("2026-10-19T14:00"),
                endAt: at("2026-10-19T14:45"),
                staffIds: ["st_meera"],
            },
        ]);
        await draw(kabir());
        await press(/^Change/);
        await press("Change the time too");
        await press(/^2:00 pm/);
        expect(readReassignCandidates).toHaveBeenLastCalledWith(
            "bk_kabir",
            at("2026-10-19T14:00"),
        );
        await press("Give it to Meera at 2:00 pm");
        expect(reassignBooking).toHaveBeenCalledWith("bk_kabir", {
            staffId: "st_meera",
            startAt: at("2026-10-19T14:00"),
        });
    });

    it("says it couldn't read who is free, with Try again", async () => {
        readReassignCandidates.mockRejectedValueOnce(new Error("offline"));
        await draw(kabir());
        await press(/^Change/);
        expect(text()).toContain("Nothing has changed.");
        await press("Try again");
        expect(text()).toContain("Free then");
    });

    it("offers Assign someone on a booking with nobody", async () => {
        readReassignCandidates.mockResolvedValue({
            startAt: at("2026-10-19T11:30"),
            people: PEOPLE.filter((p) => p.state !== "current"),
        });
        await draw(kabir({ staff: null }));
        expect(text()).toContain("Nobody yet");
        await press(/^Assign someone/);
        expect(text()).toContain("Assign someone to Kabir's booking");
        await pick("Meera Iyer");
        await press("Assign Meera");
        expect(reassignBooking).toHaveBeenCalledWith("bk_kabir", {
            staffId: "st_meera",
        });
    });

    it("is offered in Move or cancel too", async () => {
        await draw(kabir());
        await press(/Move or cancel/);
        expect(button(/Change who it's with/)).toBeDefined();
        await press(/Change who it's with/);
        expect(text()).toContain("Change who Kabir's booking is with");
    });

    it("lets a Member hand over only their own, or take one with nobody for themselves", async () => {
        const member: QuickLookContext = {
            ...CTX,
            reassign: { any: false, me: "st_meera" },
        };
        // Asha's booking isn't theirs to give away: not offered.
        await draw(kabir(), member);
        expect(button(/^Change who/)).toBeUndefined();
        act(() => root.unmount());
        root = createRoot(host);

        // One with nobody: only they can be picked.
        readReassignCandidates.mockResolvedValue({
            startAt: at("2026-10-19T11:30"),
            people: [
                { id: "st_asha", name: "Asha Rao", state: "free" },
                { id: "st_meera", name: "Meera Iyer", state: "free" },
            ],
        });
        await draw(kabir({ staff: null }), member);
        await press(/^Assign someone/);
        expect(row("Asha Rao").disabled).toBe(true);
        expect(text()).toContain(
            "Free then. An owner or admin can give it to them.",
        );
        await pick("Meera Iyer");
        await press("Assign Meera");
        expect(reassignBooking).toHaveBeenCalledWith("bk_kabir", {
            staffId: "st_meera",
        });
    });

    it("isn't offered to a role that can't change bookings", async () => {
        await draw(kabir(), { ...CTX, canBook: false });
        expect(button(/^Change/)).toBeUndefined();
    });
});
