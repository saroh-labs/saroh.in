// @vitest-environment jsdom
/**
 * A booking's page (U12, #1028; BKMBookingDetail, BKDBooking), on a phone
 * and at a desk: the day and time as the heading, one main action pinned
 * (Take ₹X, locked for the front desk with why; Book a new time once
 * cancelled), Move and More beside it with Cancel last in red, "Did Kabir
 * come?" with Undo, Money, What happened and Customer with Call, Take
 * payment as a sheet (Cash given and the change, UPI, Card, a payment
 * link), a visit of a treatment, a group class, Calendar only, a booking
 * that couldn't be read, and the keyboard.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorPage from "@/app/(shell)/bookings/[bookingId]/error";
import type { BookingMoney } from "@/lib/services/booking-money";
import type { PageBooking } from "@/lib/services/booking-page";
import type { PeekPerson } from "@/lib/services/peek";

import { BookingDetailView } from "./booking-detail";
import { FRONT_DESK_LINE } from "./calendar/quick-look-one";
import { LauncherContext } from "./new-booking/launcher";

const recordBookingOutcome = vi.fn();
const takeDeskPayment = vi.fn();
const createBookingPayLink = vi.fn();
const rescheduleBooking = vi.fn();
const cancelBooking = vi.fn();
const listAvailability = vi.fn();
const readReassignCandidates = vi.fn();
const reassignBooking = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    readReassignCandidates: (...a: unknown[]) =>
        readReassignCandidates(...a) as unknown,
    reassignBooking: (...a: unknown[]) => reassignBooking(...a) as unknown,
    recordBookingOutcome: (...a: unknown[]) =>
        recordBookingOutcome(...a) as unknown,
    takeDeskPayment: (...a: unknown[]) => takeDeskPayment(...a) as unknown,
    createBookingPayLink: (...a: unknown[]) =>
        createBookingPayLink(...a) as unknown,
    rescheduleBooking: (...a: unknown[]) => rescheduleBooking(...a) as unknown,
    cancelBooking: (...a: unknown[]) => cancelBooking(...a) as unknown,
    listAvailability: (...a: unknown[]) => listAvailability(...a) as unknown,
    readBookingForCancel: vi.fn(),
    bookVisit: vi.fn(),
    bookByHand: vi.fn(),
}));
// The page's controls reach server-only reads; none runs here.
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/class-packs/actions", () => ({
    payBookingWithPack: vi.fn(),
    takePackOffBooking: vi.fn(),
    packsFor: vi.fn(() => Promise.resolve([])),
}));

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

const deposit: BookingMoney = {
    priceCents: 80_000,
    currency: "INR",
    paidOnlineCents: 40_000,
    deposit: true,
    dueCents: 40_000,
    refund: null,
    refundableCents: 40_000,
    refundInTimeCancels: true,
    paidAtDeskCents: 0,
    deskMethod: null,
    take: { cents: 40_000, byLink: false },
};

function kabir(over: Partial<PageBooking> = {}): PageBooking {
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
        createdAt: "2026-10-15T05:30:00.000Z",
        cancelledAt: null,
        freeCancelUntil: at("2026-10-18T11:30"),
        contact: {
            id: "c_kabir",
            firstName: "Kabir",
            lastName: "Singh",
            email: "kabir.singh@example.com",
            phone: "+919000012345",
        },
        staff: { id: "st_meera", name: "Meera Iyer" },
        intakeNote: "Left knee hurts on stairs since August.",
        events: [
            {
                id: "e1",
                type: "BOOKED",
                actor: { name: "Meera Iyer" },
                fromStartAt: null,
                toStartAt: null,
                createdAt: "2026-10-15T05:30:00.000Z",
            },
            {
                id: "e2",
                type: "RESCHEDULED",
                actor: { name: "Meera Iyer" },
                fromStartAt: at("2026-10-17T10:00"),
                toStartAt: at("2026-10-19T11:30"),
                createdAt: "2026-10-16T05:30:00.000Z",
            },
        ],
        snapshot: {},
        packRedemption: null,
        service: {
            id: "svc_assess",
            name: "Physio assessment",
            status: "ACTIVE",
            capacity: 1,
            durationMinutes: 45,
            priceCents: 80_000,
            currency: "INR",
            timezone: ZONE,
        },
        money: deposit,
        treatment: null,
        ...over,
    } as unknown as PageBooking;
}

const PERSON: PeekPerson = {
    phone: "+919000012345",
    attention: {
        entries: [
            { id: "a1", kind: "ALLERGY", label: "Latex", sensitive: false },
            {
                id: "a2",
                kind: "MEDICAL",
                label: "Knee surgery in 2025",
                sensitive: false,
            },
        ],
        hiddenSensitiveCount: 0,
    },
    reach: "EMAIL",
};

const OWNER_DESK = { canTake: true, canLink: true, online: true };

let root: Root;
let host: HTMLDivElement;
const launch = vi.fn();

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
        recordBookingOutcome,
        takeDeskPayment,
        createBookingPayLink,
        rescheduleBooking,
        cancelBooking,
        listAvailability,
        readReassignCandidates,
        reassignBooking,
        refresh,
        showSuccess,
        showError,
        showUndo,
        launch,
    ]) {
        fn.mockReset();
    }
    showUndo.mockImplementation(() => "toast_1");
    listAvailability.mockResolvedValue([]);
    recordBookingOutcome.mockResolvedValue({ ok: true, data: {} });
    readReassignCandidates.mockResolvedValue({
        startAt: at("2026-10-19T11:30"),
        people: [
            { id: "st_meera", name: "Meera Iyer", state: "current" },
            { id: "st_asha", name: "Asha Rao", state: "free" },
        ],
    });
    reassignBooking.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

async function settle() {
    for (let i = 0; i < 4; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

type Props = Partial<Parameters<typeof BookingDetailView>[0]>;

async function draw(b: PageBooking, props: Props = {}) {
    await act(async () => {
        root.render(
            <LauncherContext.Provider value={{ open: launch }}>
                <BookingDetailView
                    booking={b}
                    past={Date.parse(b.endAt) < (props.now ?? NOW)}
                    now={NOW}
                    timezone={ZONE}
                    canWrite
                    canRefund
                    canReadOrder
                    desk={OWNER_DESK}
                    person={PERSON}
                    {...props}
                />
            </LauncherContext.Provider>,
        );
        await Promise.resolve();
    });
    await settle();
}

const text = () => document.body.textContent;
/** The pinned foot on a phone, the header's actions at a desk. */
const pinned = (phone: boolean) =>
    phone
        ? host.querySelector<HTMLElement>("[data-pinned]")
        : host.querySelector<HTMLElement>("[data-desk-actions]");
const buttonsIn = (el: ParentNode | null) =>
    Array.from(el?.querySelectorAll<HTMLButtonElement>("button") ?? []);
function find(label: string | RegExp, within: ParentNode = document.body) {
    return buttonsIn(within).find((b) =>
        typeof label === "string"
            ? b.textContent.trim() === label ||
              b.getAttribute("aria-label") === label
            : label.test(b.textContent.trim()),
    );
}
async function press(label: string | RegExp, within?: ParentNode) {
    const b = find(label, within);
    if (!b) throw new Error(`No button ${String(label)}: ${text()}`);
    await act(async () => {
        b.click();
        await Promise.resolve();
    });
    await settle();
}
/** More's rows, opened from the phone's "…" or the desk's More. */
async function moreRows(phone: boolean) {
    const trigger = buttonsIn(host).find((b) =>
        phone
            ? b.getAttribute("aria-label") === "More"
            : b.textContent.trim() === "More",
    );
    if (!trigger) throw new Error("No More");
    await act(async () => {
        trigger.click();
        await Promise.resolve();
    });
    await settle();
    const frame = document.querySelector<HTMLElement>(
        "[data-header-sheet], [data-header-popover]",
    );
    return {
        frame,
        rows: Array.from(frame?.querySelectorAll("li button, li a") ?? []).map(
            (el) => el.textContent.trim(),
        ),
    };
}
const dialog = () => {
    const el = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ).at(-1);
    if (!el) throw new Error("No dialog open");
    return el;
};
function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
function cashGiven(): HTMLInputElement {
    const lab = Array.from(dialog().querySelectorAll("label")).find((l) =>
        l.textContent.startsWith("Cash given"),
    );
    const el = document.getElementById(lab?.getAttribute("for") ?? "");
    if (!el) throw new Error("No Cash given field");
    return el as HTMLInputElement;
}

describe.each([
    ["phone", true],
    ["desk", false],
])("a booking's page on a %s", (_name, phone) => {
    beforeEach(() => size(phone));

    it("upcoming: the day and time as the heading, Take ₹400 pinned, Move and More", async () => {
        await draw(kabir());
        const h1 = host.querySelector("h1");
        expect(h1?.textContent).toContain("Today, Mon 19 Oct");
        expect(h1?.textContent).toContain("11:30 am to 12:15 pm");
        expect(text()).toContain("Booked");
        expect(text()).toContain("Moved once · booked by Meera");
        expect(text()).toContain(
            "Physio assessment with Meera Iyer · 45 min · times in IST",
        );
        const actions = pinned(phone);
        expect(find("Take ₹400", actions ?? undefined)).toBeDefined();
        expect(find("Move", actions ?? undefined)).toBeDefined();
        const { rows } = await moreRows(phone);
        expect(rows).toEqual([
            "See the day",
            "Book their next visit",
            "Open Kabir's page",
            "Move to another time",
            "Change who it's with",
            "Cancel booking",
        ]);
        // Cancel is last, and red.
        const cancel = find("Cancel booking");
        expect(cancel?.className).toContain("text-destructive");
    });

    it("says the money, the policy and what happened, and who with Call", async () => {
        await draw(kabir());
        expect(text()).toContain("₹800");
        expect(text()).toContain("₹400 paid online");
        expect(text()).toContain("₹400 to take at the visit");
        expect(text()).toContain("Free to cancel until Sun 18 Oct, 11:30 am.");
        expect(text()).toContain(
            "Your refund policy: the ₹400 deposit is refunded automatically if it's cancelled by then.",
        );
        expect(text()).toContain(
            "Moved from Sat 17 Oct, 10:00 am to Mon 19 Oct, 11:30 am",
        );
        expect(text()).toContain(
            "Allergy: Latex · Medical: Knee surgery in 2025",
        );
        expect(
            host.querySelector('a[href^="tel:"]')?.getAttribute("href"),
        ).toBe("tel:+919000012345");
        expect(text()).toContain("kabir.singh@example.com");
        expect(text()).toContain(
            "Their note: “Left knee hurts on stairs since August.”",
        );
        expect(
            host.querySelector('a[href="/contacts/c_kabir"]')?.textContent,
        ).toContain("Open Kabir's page");
    });

    it("Did Kabir come? Came shows at once and waits ten seconds with Undo", async () => {
        const past = kabir({
            startAt: at("2026-10-17T11:30"),
            endAt: at("2026-10-17T12:15"),
            money: { ...deposit, take: null, dueCents: 0 },
        });
        await draw(past);
        expect(text()).toContain("Sat 17 Oct");
        expect(text()).toContain("Not marked yet");
        expect(text()).toContain("Did Kabir come?");
        expect(text()).toContain("Nobody has marked it yet.");
        await press("Came");
        expect(text()).toContain("Came.");
        expect(showUndo).toHaveBeenCalledWith(
            "Kabir came.",
            expect.any(Function),
            expect.anything(),
        );
        expect(recordBookingOutcome).not.toHaveBeenCalled();
        // Once they came, the next visit is the main action.
        expect(
            find("Book their next visit", pinned(phone) ?? undefined),
        ).toBeDefined();
        // Undo beside it: back as it was, nothing written.
        await press("Undo");
        expect(text()).toContain("Nobody has marked it yet.");
        expect(recordBookingOutcome).not.toHaveBeenCalled();
    });

    it("Didn't come is recorded after ten seconds; Book Kabir again", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const past = kabir({
            startAt: at("2026-10-17T11:30"),
            endAt: at("2026-10-17T12:15"),
            money: { ...deposit, take: null, dueCents: 0 },
        });
        await draw(past);
        await press("Didn't come");
        expect(text()).toContain("Didn't come. Press Came to change it.");
        expect(
            find("Book Kabir again", pinned(phone) ?? undefined),
        ).toBeDefined();
        await act(async () => {
            vi.advanceTimersByTime(10_500);
            await Promise.resolve();
        });
        await settle();
        expect(recordBookingOutcome).toHaveBeenCalledWith(
            "bk_kabir",
            "NO_SHOW",
        );
        await press("Book Kabir again", pinned(phone) ?? undefined);
        expect(launch).toHaveBeenCalledWith({
            who: {
                kind: "contact",
                id: "c_kabir",
                name: "Kabir Singh",
                email: "kabir.singh@example.com",
                phone: "+919000012345",
            },
            serviceId: "svc_assess",
            staffId: "st_meera",
            nextVisit: true,
        });
    });

    it("awaiting payment says so", async () => {
        await draw(kabir({ status: "PENDING" }));
        expect(text()).toContain("Awaiting payment");
    });

    it("paid in full: nothing to take, no Take button", async () => {
        await draw(
            kabir({
                money: {
                    ...deposit,
                    deposit: false,
                    paidOnlineCents: 80_000,
                    dueCents: 0,
                    take: null,
                },
            }),
        );
        expect(text()).toContain("₹800 paid online");
        expect(text()).toContain("Nothing, it's paid");
        expect(find(/^Take ₹/)).toBeUndefined();
    });

    it("part paid at the desk says how", async () => {
        await draw(
            kabir({
                money: {
                    ...deposit,
                    paidAtDeskCents: 40_000,
                    deskMethod: "UPI",
                    dueCents: 0,
                    take: null,
                },
            }),
        );
        expect(text()).toContain("₹400 paid at the desk · UPI");
        expect(text()).toContain("Nothing, it's paid");
    });

    it("cancelled: Book a new time, no Move and no Cancel", async () => {
        await draw(
            kabir({
                status: "CANCELLED",
                money: {
                    ...deposit,
                    take: null,
                    dueCents: null,
                    refund: {
                        amountCents: 40_000,
                        status: "SUCCEEDED",
                        beingConfirmed: false,
                    },
                },
            }),
        );
        expect(text()).toContain("Cancelled");
        expect(text()).toContain("₹400 refunded");
        expect(find("Move")).toBeUndefined();
        await press("Book a new time", pinned(phone) ?? undefined);
        expect(launch).toHaveBeenCalledWith(
            expect.objectContaining({
                serviceId: "svc_assess",
                staffId: "st_meera",
                nextVisit: false,
            }),
        );
        const { rows } = await moreRows(phone);
        expect(rows).not.toContain("Cancel booking");
        expect(rows).not.toContain("Move to another time");
    });

    it("a visit of a treatment: its visits and order, no next visit by hand", async () => {
        await draw(
            kabir({
                treatment: {
                    orderId: "ord_1",
                    orderNumber: "ORD-004",
                    visitNumber: 2,
                    visits: 3,
                    booked: 2,
                    nextVisit: 3,
                    closed: false,
                },
                money: { ...deposit, take: null, treatmentOrderId: "ord_1" },
            }),
        );
        expect(text()).toContain("Visit 2 of 3");
        expect(text()).toContain("With order #ORD-004");
        const { rows } = await moreRows(phone);
        expect(rows).not.toContain("Book their next visit");
    });

    it("a group class: says so, and lists its waitlist", async () => {
        await draw(
            kabir({
                service: {
                    ...kabir().service,
                    name: "Mat Pilates",
                    capacity: 8,
                },
                money: { ...deposit, take: null },
            }),
            { waitlist: [] },
        );
        expect(text()).toContain(
            "Mat Pilates, a group class with Meera Iyer · 45 min",
        );
        expect(text()).toContain("Waitlist");
        const { rows } = await moreRows(phone);
        expect(rows).not.toContain("Book their next visit");
    });

    it("Take payment: a sheet with Cash given and the change, UPI, Card", async () => {
        takeDeskPayment.mockResolvedValue({
            ok: true,
            data: {
                invoiceId: "inv_1",
                number: "RC-1",
                amountCents: 40_000,
                currency: "INR",
                method: "CASH",
                changeCents: 10_000,
                replayed: false,
            },
        });
        await draw(kabir());
        await press("Take ₹400", pinned(phone) ?? undefined);
        const sheet = dialog();
        expect(sheet.className).toContain(
            phone ? "rounded-t-[18px]" : "sm:max-w-md",
        );
        expect(sheet.textContent).toContain("Take ₹400");
        expect(sheet.textContent).toContain("How are they paying?");
        const ways = Array.from(sheet.querySelectorAll('[role="radio"]')).map(
            (r) => r.textContent.trim(),
        );
        expect(ways).toEqual(["Cash", "UPI", "Card"]);
        typeInto(cashGiven(), "500");
        expect(dialog().textContent).toContain("Change ₹100");
        await press("UPI", dialog());
        expect(dialog().textContent).toContain(
            "Show the counter QR. Record it once ₹400 shows on your UPI app.",
        );
        expect(find("UPI received", dialog())).toBeDefined();
        await press("Card", dialog());
        expect(find("Card approved", dialog())).toBeDefined();
        await press("Cash", dialog());
        typeInto(cashGiven(), "500");
        await press("Take ₹400 cash", dialog());
        expect(takeDeskPayment).toHaveBeenCalledWith("bk_kabir", {
            method: "CASH",
            amountCents: 40_000,
            receivedCents: 50_000,
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "₹400 taken in cash. Give ₹100 change.",
        );
    });

    it("Take payment: a payment link instead, where it can be made", async () => {
        createBookingPayLink.mockResolvedValue({
            ok: true,
            data: { url: "https://pay.saroh.in/pay/tok_1" },
        });
        await draw(
            kabir({
                money: {
                    ...deposit,
                    deposit: false,
                    paidOnlineCents: 0,
                    dueCents: 80_000,
                    take: { cents: 80_000, byLink: true },
                },
            }),
        );
        await press("Take ₹800", pinned(phone) ?? undefined);
        await press("Send a payment link instead", dialog());
        await press("Get the payment link", dialog());
        expect(createBookingPayLink).toHaveBeenCalledWith("bk_kabir");
        expect(dialog().querySelector("input")?.value).toBe(
            "https://pay.saroh.in/pay/tok_1",
        );
    });

    it("no payment link for what's left after a deposit", async () => {
        await draw(kabir());
        await press("Take ₹400", pinned(phone) ?? undefined);
        expect(find("Send a payment link instead", dialog())).toBeUndefined();
    });

    it("a Member at the front desk: Take is locked, saying why once; Move stays", async () => {
        await draw(kabir(), {
            desk: { canTake: false, canLink: false, online: true },
        });
        const locked = find("Take ₹400", pinned(phone) ?? undefined);
        expect(locked?.disabled).toBe(true);
        const why = locked?.getAttribute("aria-describedby") ?? "";
        expect(document.getElementById(why)?.textContent).toBe(FRONT_DESK_LINE);
        expect(text().split(FRONT_DESK_LINE)).toHaveLength(2);
        expect(find("Move", pinned(phone) ?? undefined)).toBeDefined();
        expect(text()).toContain("Did Kabir come?");
    });

    it("Calendar only (no booking:write): read-only, nothing to change", async () => {
        await draw(kabir(), { canWrite: false, desk: undefined });
        expect(host.querySelector('[role="note"]')?.textContent).toContain(
            "Your role can read this booking but not change it.",
        );
        expect(find("Move")).toBeUndefined();
        expect(find("Came")).toBeUndefined();
        expect(find(/^Take ₹/)).toBeUndefined();
        const { rows } = await moreRows(phone);
        expect(rows).toEqual(["See the day", "Open Kabir's page"]);
    });

    it("Move opens U3's picker in a sheet", async () => {
        await draw(kabir());
        await press("Move", pinned(phone) ?? undefined);
        expect(dialog().textContent).toContain("Move Kabir's booking");
        expect(dialog().textContent).toContain("Kabir is emailed either way.");
        expect(listAvailability).toHaveBeenCalled();
    });

    it("keyboard: Escape closes Take payment and gives the keyboard back", async () => {
        await draw(kabir());
        const take = find("Take ₹400", pinned(phone) ?? undefined);
        take?.focus();
        await press("Take ₹400", pinned(phone) ?? undefined);
        expect(dialog().contains(document.activeElement)).toBe(true);
        await act(async () => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await Promise.resolve();
        });
        await settle();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(take);
    });
});

describe("a booking that couldn't be read", () => {
    it("says so, with Try again and the way back to All bookings", async () => {
        const retry = vi.fn();
        await act(async () => {
            root.render(
                <ErrorPage error={new Error("GET 500")} retry={retry} />,
            );
            await Promise.resolve();
        });
        expect(text()).toContain("Couldn't load this booking");
        await press("Try again");
        expect(retry).toHaveBeenCalled();
    });
});

describe.each([
    ["phone", true],
    ["desk", false],
])("Change who on a booking's page on a %s (#1157)", (_name, phone) => {
    beforeEach(() => size(phone));

    /** Asha's row in the sheet's list. */
    const asha = () =>
        Array.from(
            dialog().querySelectorAll<HTMLButtonElement>(
                'button[role="radio"]',
            ),
        ).find((b) =>
            document
                .querySelector(`label[for="${b.id}"]`)
                ?.textContent.startsWith("Asha Rao"),
        );

    it("opens from More, and holds the change ten seconds with Undo", async () => {
        await draw(kabir());
        const { frame } = await moreRows(phone);
        await press("Change who it's with", frame ?? undefined);
        expect(dialog().textContent).toContain(
            "Change who Kabir's booking is with",
        );
        expect(dialog().textContent).toContain("now with Meera Iyer");
        const row = asha();
        if (!row) throw new Error("No Asha");
        await act(async () => {
            row.click();
            await Promise.resolve();
        });
        await settle();
        await press("Give it to Asha", dialog());
        // Held: the toast offers Undo, and nothing is written yet.
        expect(showUndo).toHaveBeenCalledWith(
            "Giving it to Asha in 10 seconds",
            expect.any(Function),
            { description: "Kabir is emailed once it's done." },
        );
        expect(reassignBooking).not.toHaveBeenCalled();
        // The sheet closed: the change finished where it was opened.
        expect(
            Array.from(document.querySelectorAll('[role="dialog"]')).some((d) =>
                d.textContent.includes("Change who"),
            ),
        ).toBe(false);
        // Undo drops it, with nothing written.
        const undo = (showUndo.mock.calls.at(-1) as unknown[] | undefined)?.[1];
        await act(async () => {
            await (undo as () => Promise<unknown>)();
        });
        expect(reassignBooking).not.toHaveBeenCalled();
    });

    it("says a booking with nobody on it, with Assign someone", async () => {
        readReassignCandidates.mockResolvedValue({
            startAt: at("2026-10-19T11:30"),
            people: [{ id: "st_asha", name: "Asha Rao", state: "free" }],
        });
        await draw(kabir({ staff: null }));
        expect(text()).toContain("Nobody is on this booking yet.");
        await press("Assign someone");
        expect(dialog().textContent).toContain(
            "Assign someone to Kabir's booking",
        );
        expect(find("Pick someone", dialog())?.disabled).toBe(true);
    });

    it("isn't offered on a class, or to a role that can't change bookings", async () => {
        await draw(kabir(), { canWrite: false });
        expect((await moreRows(phone)).rows).not.toContain(
            "Change who it's with",
        );
        act(() => root.unmount());
        root = createRoot(host);
        const base = kabir();
        await draw(
            kabir({
                service: { ...base.service, capacity: 6 },
            }),
        );
        expect((await moreRows(phone)).rows).not.toContain(
            "Change who it's with",
        );
    });

    it("writes the change in What happened", async () => {
        await draw(
            kabir({
                events: [
                    {
                        id: "e9",
                        type: "REASSIGNED",
                        actor: { name: "Priya Nair" },
                        fromStartAt: at("2026-10-19T11:30"),
                        toStartAt: at("2026-10-19T11:30"),
                        fromStaff: { name: "Asha Rao" },
                        toStaff: { name: "Meera Iyer" },
                        createdAt: "2026-10-18T05:30:00.000Z",
                    },
                    {
                        id: "e10",
                        type: "REASSIGNED",
                        actor: { name: "Priya Nair" },
                        fromStartAt: at("2026-10-19T10:00"),
                        toStartAt: at("2026-10-19T11:30"),
                        fromStaff: null,
                        toStaff: { name: "Meera Iyer" },
                        createdAt: "2026-10-18T06:30:00.000Z",
                    },
                ],
            }),
        );
        expect(text()).toContain("Changed from Asha Rao to Meera Iyer");
        expect(text()).toMatch(/Given to Meera Iyer, moved to Mon 19 Oct/);
    });
});
