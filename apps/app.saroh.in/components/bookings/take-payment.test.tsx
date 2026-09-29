// @vitest-environment jsdom
/**
 * "Take ₹X" at the desk (round-2 P2): the dialog's ways to pay, the cash
 * change, what the API is sent, the toast, an inline refusal, and the pay
 * link path; and on the booking page, when the button shows — by the
 * booking's state and the viewer's role.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { BookingMoney } from "@/lib/services/booking-money";
import { bookingState } from "@/lib/services/diary";
import type { BookingDetail } from "@/lib/services/service";

import { BookingDetailView } from "./booking-detail";
import { BookingQuickLook } from "./calendar/booking-quick-look";
import { TakePayment } from "./take-payment";

const takeDeskPayment = vi.fn();
const createBookingPayLink = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    takeDeskPayment: (...args: unknown[]) =>
        takeDeskPayment(...args) as unknown,
    createBookingPayLink: (...args: unknown[]) =>
        createBookingPayLink(...args) as unknown,
    listAvailability: vi.fn(() => Promise.resolve([])),
    rescheduleBooking: vi.fn(),
    cancelBooking: vi.fn(),
    recordBookingOutcome: vi.fn(),
}));

// The page's other controls reach server-only reads; none runs here.
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

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        takeDeskPayment,
        createBookingPayLink,
        refresh,
        showSuccess,
        showError,
    ]) {
        fn.mockReset();
    }
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

const dialog = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("Dialog is not open");
    return el as HTMLElement;
};

function button(name: RegExp, within: ParentNode = dialog()) {
    const hit = Array.from(within.querySelectorAll("button")).find((b) =>
        name.test(b.textContent),
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

function chip(label: string): HTMLButtonElement {
    const hit = Array.from(
        dialog().querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent === label);
    if (!hit) throw new Error(`No chip ${label}`);
    return hit;
}

function cashGiven(): HTMLInputElement {
    const lab = Array.from(dialog().querySelectorAll("label")).find((l) =>
        l.textContent.startsWith("Cash given"),
    );
    const el = document.getElementById(lab?.getAttribute("for") ?? "");
    if (!el) throw new Error("No Cash given field");
    return el as HTMLInputElement;
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function click(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

function openTake(
    over: { byLink?: boolean; canLink?: boolean; cents?: number } = {},
) {
    act(() => {
        root.render(
            <TakePayment
                bookingId="bk_1"
                take={{
                    cents: over.cents ?? 50_000,
                    byLink: over.byLink ?? true,
                }}
                currency="INR"
                who="Priya Raman"
                canLink={over.canLink ?? true}
            />,
        );
    });
    const trigger = host.querySelector("button");
    if (!trigger) throw new Error("No trigger");
    expect(trigger.textContent).toBe("Take ₹500");
    act(() => trigger.click());
}

const PAID = {
    invoiceId: "inv_1",
    number: "RC-0007",
    amountCents: 50_000,
    currency: "INR",
    method: "CASH",
    changeCents: 50_000,
    replayed: false,
};

describe("Take ₹X at the desk", () => {
    it("offers cash, UPI at the counter, the card machine and a pay link, cash first", () => {
        openTake();
        const chips = Array.from(
            dialog().querySelectorAll<HTMLButtonElement>('[role="radio"]'),
        );
        expect(chips.map((c) => c.textContent)).toEqual([
            "Cash",
            "UPI at the counter",
            "Card machine",
            "Send a pay link",
        ]);
        expect(chip("Cash").getAttribute("aria-checked")).toBe("true");
        expect(chips.every((c) => c.className.includes("cursor-pointer"))).toBe(
            true,
        );
        expect(button(/^Take ₹500 cash$/).disabled).toBe(false);
    });

    it("works out the change from the cash given, and stops a short amount", () => {
        openTake();
        typeInto(cashGiven(), "1000");
        expect(dialog().textContent).toContain("Change ₹500");
        typeInto(cashGiven(), "300");
        expect(dialog().textContent).toContain("Short ₹200");
        expect(dialog().textContent).toContain("That's ₹200 short.");
        expect(button(/^Take ₹500 cash$/).disabled).toBe(true);
    });

    it("takes cash with what was given, says the change, and refreshes", async () => {
        takeDeskPayment.mockResolvedValue({ ok: true, data: PAID });
        openTake();
        typeInto(cashGiven(), "₹1,000");
        await click(button(/^Take ₹500 cash$/));
        expect(takeDeskPayment).toHaveBeenCalledWith("bk_1", {
            method: "CASH",
            amountCents: 50_000,
            receivedCents: 100_000,
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "₹500 taken in cash — give ₹500 change.",
        );
        expect(refresh).toHaveBeenCalled();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it.each([
        ["UPI at the counter", "UPI received", "UPI", "₹500 taken by UPI."],
        ["Card machine", "Card approved", "CARD", "₹500 taken by card."],
    ])(
        "%s: sends its method and no cash given",
        async (label, action, method, toast) => {
            takeDeskPayment.mockResolvedValue({
                ok: true,
                data: { ...PAID, method, changeCents: null },
            });
            openTake();
            act(() => chip(label).click());
            expect(() => cashGiven()).toThrow();
            await click(button(new RegExp(`^${action}$`)));
            expect(takeDeskPayment).toHaveBeenCalledWith("bk_1", {
                method,
                amountCents: 50_000,
            });
            expect(showSuccess).toHaveBeenCalledWith(
                `${toast.slice(0, -1)}. The invoice is marked paid.`,
            );
        },
    );

    it("says the API's refusal in the dialog and keeps it open", async () => {
        takeDeskPayment.mockResolvedValue({
            ok: false,
            error: "This booking is already paid.",
        });
        openTake();
        await click(button(/^Take ₹500 cash$/));
        const alert = dialog().querySelector('[role="alert"]');
        expect(alert?.textContent).toBe("This booking is already paid.");
        expect(showSuccess).not.toHaveBeenCalled();
    });

    it("makes a pay link instead, and shows it to copy", async () => {
        createBookingPayLink.mockResolvedValue({
            ok: true,
            data: { url: "https://pay.saroh.in/pay/tok_1" },
        });
        openTake();
        act(() => chip("Send a pay link").click());
        await click(button(/^Get the pay link$/));
        expect(createBookingPayLink).toHaveBeenCalledWith("bk_1");
        expect(takeDeskPayment).not.toHaveBeenCalled();
        const field = dialog().querySelector("input");
        expect(field?.value).toBe("https://pay.saroh.in/pay/tok_1");
        await click(button(/^Done$/));
        expect(refresh).toHaveBeenCalled();
    });

    it("never offers a link for what's left after a deposit, or without a provider", () => {
        openTake({ byLink: false });
        expect(chip("Send a pay link").disabled).toBe(true);
        expect(chip("Send a pay link").title).toContain("take the rest here");
        act(() => root.unmount());
        root = createRoot(host);
        openTake({ canLink: false });
        expect(chip("Send a pay link").disabled).toBe(true);
        expect(chip("Send a pay link").title).toContain(
            "Connect a payment provider",
        );
    });
});

function detail(money: Partial<BookingMoney>, status = "CONFIRMED") {
    return {
        id: "bk_1",
        serviceId: "svc_1",
        status,
        outcome: null,
        startAt: "2099-10-01T05:30:00.000Z",
        endAt: "2099-10-01T06:00:00.000Z",
        timezone: "Asia/Kolkata",
        bookerName: "Priya Raman",
        bookerEmail: "priya@example.com",
        bookerPhone: null,
        contact: null,
        events: [],
        snapshot: {},
        packRedemption: null,
        freeCancelUntil: null,
        service: {
            id: "svc_1",
            name: "Check-up",
            status: "ACTIVE",
            capacity: 1,
            timezone: "Asia/Kolkata",
        },
        money: {
            priceCents: 50_000,
            currency: "INR",
            paidOnlineCents: 0,
            deposit: false,
            dueCents: 50_000,
            refund: null,
            paidAtDeskCents: 0,
            deskMethod: null,
            take: { cents: 50_000, byLink: true },
            ...money,
        },
    } as unknown as BookingDetail;
}

function renderDetail(
    booking: BookingDetail,
    desk?: { canTake: boolean; canLink: boolean },
) {
    act(() => {
        root.render(
            <BookingDetailView booking={booking} past={false} desk={desk} />,
        );
    });
}

const takeButton = () =>
    Array.from(host.querySelectorAll("button")).find((b) =>
        b.textContent.startsWith("Take ₹"),
    );

describe("the booking page's Take ₹X", () => {
    it("shows for a pay-at-the-desk booking, to someone who may take it", () => {
        renderDetail(detail({}), { canTake: true, canLink: true });
        expect(takeButton()?.textContent).toBe("Take ₹500");
        expect(host.textContent).toContain("₹500 due at the visit");
    });

    it("takes only the balance after a deposit", () => {
        renderDetail(
            detail({
                priceCents: 80_000,
                paidOnlineCents: 40_000,
                deposit: true,
                dueCents: 40_000,
                take: { cents: 40_000, byLink: false },
            }),
            { canTake: true, canLink: true },
        );
        expect(takeButton()?.textContent).toBe("Take ₹400");
        expect(host.textContent).toContain(
            "Deposit ₹400 paid · ₹400 due at the visit",
        );
    });

    it("is hidden from a role that can't take it", () => {
        renderDetail(detail({}), { canTake: false, canLink: false });
        expect(takeButton()).toBeUndefined();
        renderDetail(detail({}));
        expect(takeButton()).toBeUndefined();
    });

    it("is gone once paid at the desk, which the page says with how", () => {
        renderDetail(
            detail({
                dueCents: 0,
                paidAtDeskCents: 50_000,
                deskMethod: "UPI",
                take: null,
            }),
            { canTake: true, canLink: true },
        );
        expect(takeButton()).toBeUndefined();
        expect(host.textContent).toContain("₹500 paid at the desk · UPI");
    });

    it("is gone for a treatment's visit, paid on its order", () => {
        renderDetail(detail({ take: null, treatmentOrderId: "ord_1" }), {
            canTake: true,
            canLink: true,
        });
        expect(takeButton()).toBeUndefined();
    });

    it("is gone for a cancelled booking", () => {
        renderDetail(detail({ dueCents: null, take: null }, "CANCELLED"), {
            canTake: true,
            canLink: true,
        });
        expect(takeButton()).toBeUndefined();
    });
});

function diaryBooking(over: Partial<DiaryBooking> = {}): DiaryBooking {
    return {
        id: "bk_1",
        serviceId: "svc_1",
        startAt: "2099-10-01T05:30:00.000Z",
        endAt: "2099-10-01T06:00:00.000Z",
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: null,
        bookerName: "Priya Raman",
        bookerEmail: "priya@example.com",
        bookerPhone: null,
        createdAt: "2099-09-01T05:30:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc_1",
            name: "Check-up",
            timezone: "Asia/Kolkata",
            capacity: 1,
            durationMinutes: 30,
            priceCents: 50_000,
            currency: "INR",
        },
        contact: null,
        staff: null,
        paidWith: "DESK",
        packName: null,
        subscriptionId: null,
        paidAtDesk: null,
        take: { cents: 50_000, byLink: true },
        ...over,
    };
}

function renderPeek(
    b: DiaryBooking,
    desk?: { canTake: boolean; canLink: boolean },
) {
    act(() => {
        root.render(
            <BookingQuickLook
                block={{
                    kind: "one",
                    key: b.id,
                    start: 11 * 60,
                    end: 11 * 60 + 30,
                    state: bookingState(b),
                    staffId: null,
                    booking: b,
                }}
                onClose={() => undefined}
                ctx={{
                    timezone: "Asia/Kolkata",
                    now: Date.parse("2099-10-01T05:00:00.000Z"),
                    money: true,
                    rules: null,
                    canBook: true,
                    desk,
                }}
                act={{
                    checkIn: vi.fn(),
                    noShow: vi.fn(),
                    cancel: vi.fn(),
                    move: vi.fn(),
                    cancelClass: vi.fn(),
                }}
                heldFor={() => null}
            />,
        );
    });
}

const peekTake = () =>
    Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.startsWith("Take ₹"),
    );

describe("the calendar quick look's Take ₹X", () => {
    it("shows beside the desk's actions, and opens the dialog", () => {
        renderPeek(diaryBooking(), { canTake: true, canLink: true });
        const trigger = peekTake();
        expect(trigger?.textContent).toBe("Take ₹500");
        expect(document.body.textContent).toContain(
            "Not yet — pays at the session",
        );
        act(() => trigger?.click());
        const dialogs = document.querySelectorAll('[role="dialog"]');
        expect(dialogs[dialogs.length - 1].textContent).toContain(
            "UPI at the counter",
        );
    });

    it("is hidden from a role that can't take it, and when nothing is left", () => {
        renderPeek(diaryBooking(), { canTake: false, canLink: false });
        expect(peekTake()).toBeUndefined();
        renderPeek(diaryBooking({ take: null }), {
            canTake: true,
            canLink: true,
        });
        expect(peekTake()).toBeUndefined();
    });

    it("says paid at the desk, with how, once it's taken", () => {
        renderPeek(
            diaryBooking({ take: null, paidAtDesk: { method: "CASH" } }),
            { canTake: true, canLink: true },
        );
        expect(peekTake()).toBeUndefined();
        expect(document.body.textContent).toContain("Paid at the desk · Cash");
    });

    it("is gone for a cancelled booking", () => {
        renderPeek(
            diaryBooking({
                status: "CANCELLED",
                cancelledAt: "2099-09-02T00:00:00.000Z",
            }),
            { canTake: true, canLink: true },
        );
        expect(peekTake()).toBeUndefined();
    });
});
