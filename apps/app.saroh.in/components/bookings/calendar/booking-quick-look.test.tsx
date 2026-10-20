// @vitest-environment jsdom
/**
 * The quick look (U7, #1023; BKMQuickLook, BKMQuickLookStep2,
 * BKMNextVisit, BKDQuickLook), on a phone and at a desk: one main action
 * at a time (Mark arrived → Take ₹X → Book their next visit), Came and
 * Didn't come with Undo, Move with U3's picker (and a time just taken),
 * Cancel with the money question the policy presets (in time, late, the
 * refund locked without permission, nothing paid), a class, a visit of a
 * treatment, the front desk, Calendar only, a person who couldn't be read,
 * and the keyboard.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    ClassSession,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { BookingMoney } from "@/lib/services/booking-money";
import type { Block } from "@/lib/services/diary";
import { bookingState } from "@/lib/services/diary";

import { BookingQuickLook } from "./booking-quick-look";
import { CALENDAR_ONLY_LINE, FRONT_DESK_LINE } from "./quick-look-one";
import type { QuickLookActions, QuickLookContext } from "./quick-look-types";

const readBookingPerson = vi.fn();
const listAvailability = vi.fn();
const rescheduleBooking = vi.fn();
const cancelBooking = vi.fn();
const readBookingForCancel = vi.fn();
const bookByHand = vi.fn();
const bookVisit = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    readBookingPerson: (...a: unknown[]) => readBookingPerson(...a) as unknown,
    listAvailability: (...a: unknown[]) => listAvailability(...a) as unknown,
    rescheduleBooking: (...a: unknown[]) => rescheduleBooking(...a) as unknown,
    cancelBooking: (...a: unknown[]) => cancelBooking(...a) as unknown,
    readBookingForCancel: (...a: unknown[]) =>
        readBookingForCancel(...a) as unknown,
    bookByHand: (...a: unknown[]) => bookByHand(...a) as unknown,
    bookVisit: (...a: unknown[]) => bookVisit(...a) as unknown,
    takeDeskPayment: vi.fn(),
    createBookingPayLink: vi.fn(),
}));
// Take ₹X's dialog reaches server-only reads; none runs here.
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
const showUndo = vi.fn(() => "toast_1");
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
    showError: (...a: unknown[]) => showError(...a) as unknown,
    showUndo: (...a: unknown[]) => showUndo(...(a as [])) as unknown,
    showInfo: vi.fn(),
    showWarning: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn((fn: () => unknown) => fn()),
}));

const ZONE = "Asia/Kolkata";
// Mon 19 Oct 2026, 11:20 am in India; Kabir is at 11:30.
const NOW = Date.parse("2026-10-19T05:50:00.000Z");
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
        staff: { id: "st_meera", name: "Meera Iyer" },
        paidWith: "DESK",
        packName: null,
        subscriptionId: null,
        paidAtDesk: null,
        take: { cents: 50_000, byLink: true },
        ...over,
    };
}

const oneBlock = (b: DiaryBooking): Block => ({
    kind: "one",
    key: b.id,
    start: 11 * 60 + 30,
    end: 12 * 60 + 15,
    state: bookingState(b),
    staffId: b.staff?.id ?? null,
    booking: b,
});

const OWNER: QuickLookContext = {
    timezone: ZONE,
    now: NOW,
    money: true,
    rules: {
        freeCancelHours: 24,
    } as QuickLookContext["rules"],
    canBook: true,
    canRefund: true,
    canEditService: true,
    desk: { canTake: true, canLink: true, online: true },
    notices: null,
};

const deposit: BookingMoney = {
    priceCents: 80_000,
    currency: "INR",
    paidOnlineCents: 40_000,
    deposit: true,
    dueCents: 40_000,
    refund: null,
    refundableCents: 40_000,
    refundInTimeCancels: true,
};

const act$ = {
    checkIn: vi.fn(),
    noShow: vi.fn(),
    cancel: vi.fn(),
    cancelClass: vi.fn(),
};
const undoOutcome = vi.fn();

/**
 * The calendar around the quick look, as far as it matters here: an
 * opener that takes the keyboard back, and the desk's changes applied
 * with their Undo (as `calendar-screen.tsx` holds them).
 */
function Calendar({
    first,
    ctx,
    asClass,
}: {
    first: DiaryBooking;
    ctx: QuickLookContext;
    asClass?: Block;
}) {
    const [open, setOpen] = useState(true);
    const [b, setB] = useState(first);
    const [held, setHeld] = useState<DiaryBooking | null>(null);
    const actions: QuickLookActions = {
        ...act$,
        checkIn(x) {
            act$.checkIn(x);
            setHeld(b);
            setB({ ...x, outcome: "ATTENDED" });
        },
        noShow(x) {
            act$.noShow(x);
            setHeld(b);
            setB({ ...x, outcome: "NO_SHOW" });
        },
    };
    return (
        <>
            <button id="opener" type="button" onClick={() => setOpen(true)}>
                Open
            </button>
            <BookingQuickLook
                block={open ? (asClass ?? oneBlock(b)) : null}
                onClose={() => setOpen(false)}
                ctx={ctx}
                act={actions}
                heldFor={(id) =>
                    held && id === b.id
                        ? () => {
                              undoOutcome();
                              setB(held);
                              setHeld(null);
                          }
                        : null
                }
            />
        </>
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
        rescheduleBooking,
        cancelBooking,
        readBookingForCancel,
        bookByHand,
        bookVisit,
        refresh,
        showSuccess,
        showError,
        showUndo,
        undoOutcome,
        ...Object.values(act$),
    ]) {
        fn.mockReset();
    }
    showUndo.mockImplementation(() => "toast_1");
    readBookingPerson.mockResolvedValue({
        phone: "+919000012345",
        attention: {
            entries: [
                {
                    id: "a1",
                    kind: "ALLERGY",
                    label: "Latex",
                    sensitive: false,
                },
            ],
            hiddenSensitiveCount: 0,
        },
        reach: "EMAIL_AND_ACCOUNT",
    });
    listAvailability.mockResolvedValue([]);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 4; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
    // Radix gives focus back on a timer.
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function draw(
    first: DiaryBooking,
    ctx: QuickLookContext = OWNER,
    asClass?: Block,
) {
    await act(async () => {
        root.render(<Calendar first={first} ctx={ctx} asClass={asClass} />);
        await Promise.resolve();
    });
    await settle();
}

const sheet = () =>
    document.querySelector<HTMLElement>("[data-quick-look]") ?? null;
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
async function more(row: string) {
    await press(/^More$/);
    await press(row);
}
/** More's own frame: the phone's sheet or the desk's menu. */
const moreFrame = () =>
    document.querySelector<HTMLElement>(
        "[data-header-sheet], [data-header-popover]",
    );
const moreRows = async () => {
    await press(/^More$/);
    const frame = moreFrame();
    const rows = Array.from(
        frame?.querySelectorAll("li button, li a") ?? [],
    ).map((el) => el.textContent.trim());
    const close = Array.from(
        frame?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((b) => b.getAttribute("aria-label") === "Close");
    await act(async () => {
        close?.click();
        await Promise.resolve();
    });
    await settle();
    return rows;
};
/** A money choice, by the words of its label. */
const choice = (label: string) => {
    const hit = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ).find((b) =>
        document
            .querySelector(`label[for="${b.id}"]`)
            ?.textContent.startsWith(label),
    );
    if (!hit) throw new Error(`No choice ${label}`);
    return hit;
};

describe.each([
    ["phone", true],
    ["desk", false],
])("the quick look on a %s", (_name, phone) => {
    beforeEach(() => size(phone));

    it("is a bottom sheet on a phone and the side panel at a desk", async () => {
        await draw(kabir());
        const el = sheet();
        expect(el?.className).toContain(
            phone ? "rounded-t-[18px]" : "sm:max-w-[480px]",
        );
    });

    it("says who, when, how it is paid and what to do next", async () => {
        await draw(kabir());
        expect(text()).toContain("Kabir Singh");
        expect(text()).toContain("Booked");
        expect(text()).toContain("Today · 11:30 am to 12:15 pm");
        expect(text()).toContain("Physio assessment with Meera Iyer");
        expect(text()).toContain("Pays at the visit · ₹500");
        expect(text()).toContain("Needs attention.");
        expect(text()).toContain("Allergy: Latex");
        expect(text()).toContain("+91");
        expect(
            document.querySelector('a[href^="tel:"]')?.getAttribute("href"),
        ).toBe("tel:+919000012345");
        expect(text()).toContain("Free to cancel until 24 hours before.");
        expect(button("Mark Kabir arrived")).toBeDefined();
        expect(button(/Move or cancel/)).toBeDefined();
        expect(await moreRows()).toEqual([
            "Take ₹500 now",
            "Open Kabir's page",
            "The full booking and its history",
            "Book their next visit",
            "Move to another time",
            "Change who it's with",
            "Cancel booking",
        ]);
    });

    it("goes Mark arrived → Take ₹500 → Book their next visit, with Undo", async () => {
        await draw(kabir());
        await press("Mark Kabir arrived");
        expect(act$.checkIn).toHaveBeenCalledOnce();
        expect(text()).toContain("Came");
        expect(text()).toContain("Pays at the visit · ₹500 to take now");
        expect(button("Take ₹500")).toBeDefined();
        expect(text()).toContain("Book their next visit?");
        expect(button(/Move or cancel/)).toBeUndefined();

        // Take ₹500 opens the desk's dialog over the quick look.
        await press("Take ₹500");
        const dialogs = document.querySelectorAll('[role="dialog"]');
        expect(dialogs[dialogs.length - 1].textContent).toContain("UPI");
        await act(async () => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await Promise.resolve();
        });
        await settle();

        // Undo, not arrived yet: back to Booked.
        await more("Undo: not arrived yet");
        expect(undoOutcome).toHaveBeenCalledOnce();
        expect(button("Mark Kabir arrived")).toBeDefined();
    });

    it("offers Book their next visit once it's paid, and books the day picked", async () => {
        listAvailability.mockResolvedValue([
            { startAt: at("2026-10-20T10:30"), endAt: at("2026-10-20T11:15") },
            { startAt: at("2026-10-20T14:00"), endAt: at("2026-10-20T14:45") },
        ]);
        bookByHand.mockResolvedValue({ ok: true, data: { id: "bk_next" } });
        await draw(
            kabir({
                outcome: "ATTENDED",
                take: null,
                paidAtDesk: { method: "UPI" },
            }),
        );
        await press("Book their next visit");
        expect(text()).toContain("Which day?");
        expect(text()).toContain("Next visit · Kabir Singh");
        expect(button("Pick a day")?.disabled).toBe(true);
        await press(/^Tomorrow · Tue 20/);
        expect(listAvailability).toHaveBeenCalledWith(
            "svc_assess",
            expect.any(String),
            expect.any(String),
            "st_meera",
        );
        await press(/^10:30 am/);
        await press("Book Tue 20 Oct at 10:30 am");
        expect(bookByHand).toHaveBeenCalledWith(
            "svc_assess",
            expect.objectContaining({
                contactId: "c_kabir",
                startAt: at("2026-10-20T10:30"),
                paidWith: "DESK",
                staffId: "st_meera",
            }),
        );
        expect(showSuccess).toHaveBeenCalledWith(
            "Booked Kabir for Tue 20 Oct at 10:30 am.",
            undefined,
        );
        expect(sheet()).toBeNull();
    });

    it("from the card after they came: Next week opens a week on, never a fixed time", async () => {
        await draw(kabir({ outcome: "ATTENDED" }));
        await press(/^Next week$/);
        expect(text()).toContain("Which day?");
        expect(
            buttons()
                .find((b) => b.textContent.startsWith("Next week · "))
                ?.getAttribute("aria-checked"),
        ).toBe("true");
        expect(text()).toContain("Mon 26 Oct");
        expect(button("Pick a time")?.disabled).toBe(true);
    });

    it("Didn't come, with Undo, and Mark as came", async () => {
        const late = { ...OWNER, now: Date.parse(at("2026-10-19T12:30")) };
        await draw(kabir(), late);
        await more("Mark as didn't come");
        expect(act$.noShow).toHaveBeenCalledOnce();
        expect(text()).toContain("Didn't come");
        expect(button("Book Kabir again")).toBeDefined();
        await more("Undo: Kabir didn't come");
        expect(undoOutcome).toHaveBeenCalledOnce();

        await more("Mark as didn't come");
        await more("Mark as came");
        expect(act$.checkIn).toHaveBeenCalled();
    });

    it("moves to a new time, and says when that time was just taken", async () => {
        listAvailability.mockResolvedValue([
            { startAt: at("2026-10-19T15:00"), endAt: at("2026-10-19T15:45") },
            { startAt: at("2026-10-20T10:00"), endAt: at("2026-10-20T10:45") },
        ]);
        rescheduleBooking.mockResolvedValueOnce({
            ok: false,
            error: "Meera Iyer is already booked then.",
        });
        await draw(kabir());
        await press(/Move or cancel/);
        expect(text()).toContain("Change Kabir's booking?");
        expect(text()).toContain(
            "Kabir is emailed either way and sees the change in their account on your site.",
        );
        expect(document.activeElement?.textContent).toBe(
            "Change Kabir's booking?",
        );
        await press(/^Move to another time$/);
        expect(text()).toContain("Move Kabir's booking");
        expect(text()).toContain(
            "Now: today, 11:30 am · Physio assessment · 45 min",
        );
        expect(button("Pick a new time")?.disabled).toBe(true);
        await press(/^3:00 pm/);
        expect(text()).toContain("→ Today, 3:00 pm");

        // Taken meanwhile: said in the picker, which reads again; it stays.
        const reads = listAvailability.mock.calls.length;
        await press("Move to 3:00 pm");
        expect(text()).toContain(
            "3:00 pm was just booked by someone else. Pick another time.",
        );
        expect(text()).toContain("Move Kabir's booking");
        expect(listAvailability.mock.calls.length).toBeGreaterThan(reads);

        rescheduleBooking.mockResolvedValueOnce({ ok: true, data: {} });
        await press(/^3:00 pm/);
        await press("Move to 3:00 pm");
        expect(rescheduleBooking).toHaveBeenLastCalledWith(
            "bk_kabir",
            at("2026-10-19T15:00"),
        );
        expect(showUndo).toHaveBeenCalledWith(
            "Moved Kabir to Mon 19 Oct at 3:00 pm. Kabir is emailed.",
            expect.any(Function),
        );
        expect(sheet()).toBeNull();
    });

    it("Keep it as it is goes back to the booking", async () => {
        await draw(kabir());
        await press(/Move or cancel/);
        await press("Keep it as it is");
        expect(button("Mark Kabir arrived")).toBeDefined();
    });

    it("cancels in time: the policy refunds the deposit", async () => {
        readBookingForCancel.mockResolvedValue({
            money: deposit,
            freeCancelUntil: "2099-10-18T06:00:00.000Z",
            timezone: ZONE,
        });
        cancelBooking.mockResolvedValue({
            ok: true,
            data: { money: { refundCents: 40_000, currency: "INR" } },
        });
        await draw(kabir());
        await press(/Move or cancel/);
        await press("Cancel booking");
        expect(text()).toContain("Cancel Kabir's booking?");
        expect(text()).toContain("so your policy refunds the deposit");
        expect(choice("Refund ₹400").getAttribute("aria-checked")).toBe("true");
        await press("Cancel and refund ₹400");
        expect(cancelBooking).toHaveBeenCalledWith("bk_kabir", {});
        expect(sheet()).toBeNull();
    });

    it("cancels late: Keep is preset, and Refund is locked, with why, without refund permission", async () => {
        readBookingForCancel.mockResolvedValue({
            money: deposit,
            freeCancelUntil: "2000-10-18T06:00:00.000Z",
            timezone: ZONE,
        });
        await draw(kabir(), { ...OWNER, canRefund: false });
        await more("Cancel booking");
        expect(text()).toContain("so your policy keeps the deposit.");
        expect(choice("Keep the deposit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(choice("Refund ₹400").disabled).toBe(true);
        expect(text()).toContain(
            "Only someone who can refund payments can give it back.",
        );
        expect(button("Cancel, keep the deposit")).toBeDefined();
    });

    it("cancels late with refund permission: Keep is preset, Refund can be picked", async () => {
        readBookingForCancel.mockResolvedValue({
            money: deposit,
            freeCancelUntil: "2000-10-18T06:00:00.000Z",
            timezone: ZONE,
        });
        await draw(kabir());
        await more("Cancel booking");
        expect(text()).toContain("You can still refund it.");
        expect(choice("Keep the deposit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(choice("Refund ₹400").disabled).toBe(false);
    });

    it("cancels with nothing paid: held ten seconds with Undo, the quick look closed", async () => {
        readBookingForCancel.mockResolvedValue({
            money: null,
            freeCancelUntil: null,
            timezone: ZONE,
        });
        await draw(kabir());
        await more("Cancel booking");
        expect(text()).toContain("Kabir is told");
        await press("Cancel booking");
        expect(showUndo).toHaveBeenCalledWith(
            "Cancelling in 10 seconds",
            expect.any(Function),
            expect.anything(),
        );
        expect(cancelBooking).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
        // Opened again inside the ten seconds: it reads as cancelled, with Undo.
        await press("Open");
        expect(text()).toContain("Cancelled");
        expect(await moreRows()).toContain("Undo the cancel");
    });

    it("says the cancel sheet couldn't read the money, and nothing changed", async () => {
        readBookingForCancel.mockResolvedValue(null);
        await draw(kabir());
        await more("Cancel booking");
        expect(text()).toContain("Couldn't load what was paid for it");
        expect(text()).toContain("The booking hasn't been cancelled.");
    });

    it("a class: places, who's booked, Cancel a place, and Cancel the class last", async () => {
        const names = [
            "Aisha Rahman",
            "Dev Malhotra",
            "Farah Khan",
            "Isha Joshi",
        ];
        const seats = names.map((name, i) =>
            kabir({
                id: `seat_${i}`,
                bookerName: name,
                contact: null,
                bookerEmail: null,
                paidWith: i < 2 ? "PACK" : "DESK",
                packName: i < 2 ? "10 Pilates classes" : null,
                startAt: at("2026-10-19T18:00"),
                take: null,
                service: {
                    ...kabir().service,
                    id: "svc_mat",
                    name: "Mat Pilates",
                    capacity: 4,
                },
                staff: { id: "st_neha", name: "Neha Kapoor" },
            }),
        );
        const session: ClassSession = {
            key: "cls_1",
            service: seats[0].service,
            startAt: at("2026-10-19T18:00"),
            endAt: at("2026-10-19T19:00"),
            staff: { id: "st_neha", name: "Neha Kapoor" },
            capacity: 4,
            taken: 4,
            bookings: seats,
        };
        const block: Block = {
            kind: "class",
            key: "cls_1",
            start: 18 * 60,
            end: 19 * 60,
            state: "full",
            staffId: "st_neha",
            session,
        };
        await draw(kabir(), OWNER, block);
        expect(text()).toContain("Mat Pilates");
        expect(text()).toContain("Full");
        expect(text()).toContain("Group class with Neha Kapoor");
        expect(text()).toContain("4 of 4 · full");
        expect(text()).toContain("Who's booked");
        expect(text()).toContain(
            "2 of 4 places are on a pack or membership. Cancelling a place frees one.",
        );
        await press(/^Cancel a place for Aisha Rahman$/);
        expect(act$.cancel).toHaveBeenCalledWith(seats[0]);
        expect(await moreRows()).toEqual([
            "Edit this class",
            "See the whole day",
            "Cancel the class",
        ]);
        await more("Cancel the class");
        expect(act$.cancelClass).toHaveBeenCalledWith(seats, "Mat Pilates");
    });

    it("a visit of a treatment: its order, its visit, and the next visit on it", async () => {
        bookVisit.mockResolvedValue({ ok: true, data: { id: "bk_v3" } });
        listAvailability.mockResolvedValue([
            { startAt: at("2026-10-20T10:30"), endAt: at("2026-10-20T11:15") },
        ]);
        await draw(
            kabir({
                outcome: "ATTENDED",
                take: null,
                paidWith: null,
                treatment: {
                    orderId: "ord_1",
                    orderNumber: "ORD-1042",
                    visitNumber: 2,
                    visits: 5,
                    booked: 2,
                    nextVisit: 3,
                    closed: false,
                },
            }),
        );
        expect(text()).toContain("With order #ORD-1042");
        expect(text()).toContain("Visit 2 of 5");
        await press("Book their next visit");
        await press(/^Tomorrow · Tue 20/);
        await press(/^10:30 am/);
        await press("Book Tue 20 Oct at 10:30 am");
        expect(bookVisit).toHaveBeenCalledWith("ord_1", {
            visitNumber: 3,
            startAt: at("2026-10-20T10:30"),
            staffId: "st_meera",
        });
        expect(bookByHand).not.toHaveBeenCalled();
    });

    it("the front desk marks arrivals, moves and cancels, and is told why there's no Take", async () => {
        const member = {
            ...OWNER,
            canRefund: false,
            canEditService: false,
            desk: { canTake: false, canLink: false },
        };
        await draw(kabir(), member);
        expect(button("Mark Kabir arrived")).toBeDefined();
        expect(button(/Move or cancel/)).toBeDefined();
        expect(text()).toContain(FRONT_DESK_LINE);
        expect(await moreRows()).not.toContain("Take ₹500 now");
        await press("Mark Kabir arrived");
        expect(button("Book their next visit")).toBeDefined();
        expect(button("Take ₹500")).toBeUndefined();
    });

    it("Calendar only: read-only, saying why, with the booking's pages still in More", async () => {
        await draw(kabir(), { ...OWNER, canBook: false, desk: undefined });
        expect(text()).toContain(CALENDAR_ONLY_LINE);
        expect(button("Mark Kabir arrived")).toBeUndefined();
        expect(button(/Move or cancel/)).toBeUndefined();
        expect(await moreRows()).toEqual([
            "Open Kabir's page",
            "The full booking and its history",
        ]);
    });

    it("says it couldn't load their phone and notes, and tries again", async () => {
        readBookingPerson.mockRejectedValueOnce(new Error("down"));
        await draw(kabir());
        expect(text()).toContain("Couldn't load their phone and notes");
        expect(button("Mark Kabir arrived")).toBeDefined();
        await press("Try again");
        expect(readBookingPerson).toHaveBeenCalledTimes(2);
        expect(text()).toContain("Allergy: Latex");
    });

    it("keyboard: Escape closes it and gives the keyboard back to the calendar", async () => {
        await draw(kabir());
        await press("Close");
        expect(sheet()).toBeNull();
        const opener = document.getElementById("opener");
        opener?.focus();
        await act(async () => {
            opener?.click();
            await Promise.resolve();
        });
        await settle();
        expect(sheet()).not.toBeNull();
        expect(sheet()?.contains(document.activeElement)).toBe(true);
        await act(async () => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await Promise.resolve();
        });
        await settle();
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(opener);
    });
});
