// @vitest-environment jsdom
/**
 * The one cancel sheet (U3, BA-01, Q14): the money question picked by the
 * business's policy — Refund in time, Keep the deposit late — Refund
 * still there for someone who may refund, the same preset for a Member,
 * a plain question with Undo when nothing was paid, the money read when
 * the screen doesn't hold it, a bottom sheet on a phone and a side panel
 * at a desk, and the keyboard.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingMoney } from "@/lib/services/booking-money";

import type { CancelSheetBooking } from "./cancel-sheet";
import { CancelSheet } from "./cancel-sheet";

const cancelBooking = vi.fn();
const readBookingForCancel = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    cancelBooking: (...args: unknown[]) => cancelBooking(...args) as unknown,
    readBookingForCancel: (...args: unknown[]) =>
        readBookingForCancel(...args) as unknown,
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn() }),
}));

const showSuccess = vi.fn();
const showError = vi.fn();
const showUndo = vi.fn(() => "toast_1");
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showUndo: (...args: unknown[]) => showUndo(...(args as [])) as unknown,
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));

const ZONE = "Asia/Kolkata";
const DEADLINE = "2026-10-18T06:00:00.000Z";

const deposit: BookingMoney = {
    priceCents: 80000,
    currency: "INR",
    paidOnlineCents: 40000,
    deposit: true,
    dueCents: 40000,
    refund: null,
    refundableCents: 40000,
    refundInTimeCancels: true,
};

const booking = (
    over: Partial<CancelSheetBooking> = {},
): CancelSheetBooking => ({
    id: "bk_1",
    who: "Kabir Singh",
    when: "Today, 11:30 am · Deposit ₹400 paid",
    money: deposit,
    freeCancelUntil: DEADLINE,
    timezone: ZONE,
    ...over,
});

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();
const onCancelled = vi.fn();

function phone(narrow: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: narrow && query.includes("max-width: 759px"),
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
        cancelBooking,
        readBookingForCancel,
        refresh,
        showSuccess,
        showError,
        showUndo,
        onClose,
        onCancelled,
    ]) {
        fn.mockReset();
    }
    showUndo.mockReturnValue("toast_1");
    cancelBooking.mockResolvedValue({
        ok: true,
        data: { id: "bk_1", money: { refund: null, kept: null } },
    });
    phone(false);
    vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

async function draw(
    props: Partial<Parameters<typeof CancelSheet>[0]> & { now?: string } = {},
) {
    vi.setSystemTime(new Date(props.now ?? "2026-10-17T06:00:00.000Z"));
    await act(async () => {
        root.render(
            <CancelSheet
                open
                booking={booking()}
                onClose={onClose}
                onCancelled={onCancelled}
                {...props}
            />,
        );
        await Promise.resolve();
    });
}

const sheet = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("The sheet is not open");
    return el as HTMLElement;
};

function button(name: string): HTMLButtonElement {
    const hit = Array.from(sheet().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

const choice = (label: string) => {
    const hit = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ).find((b) =>
        sheet()
            .querySelector(`label[for="${b.id}"]`)
            ?.textContent.startsWith(label),
    );
    if (!hit) throw new Error(`No choice ${label}`);
    return hit;
};

async function submit(name: string) {
    await act(async () => {
        button(name).click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("the cancel sheet", () => {
    it("in time: says the policy and picks Refund", async () => {
        await draw();
        expect(sheet().textContent).toContain("Cancel Kabir's booking?");
        expect(sheet().textContent).toContain(
            "Today, 11:30 am · Deposit ₹400 paid",
        );
        expect(sheet().textContent).toContain(
            "It's before the free-cancel time (Sun 18 Oct, 11:30 am), so your policy refunds the deposit.",
        );
        expect(sheet().textContent).toContain("The ₹400 deposit");
        expect(choice("Refund ₹400").getAttribute("aria-checked")).toBe("true");
        expect(choice("Keep the deposit").disabled).toBe(true);
        await submit("Cancel and refund ₹400");
        expect(cancelBooking).toHaveBeenCalledWith("bk_1", {});
        expect(showSuccess).toHaveBeenCalledWith("Booking cancelled");
        expect(onClose).toHaveBeenCalled();
        expect(onCancelled).toHaveBeenCalled();
    });

    it("late: picks Keep the deposit, and a refunder can still refund", async () => {
        await draw({ now: "2026-10-19T06:00:00.000Z", canRefund: true });
        expect(sheet().textContent).toContain(
            "so your policy keeps the deposit. You can still refund it.",
        );
        expect(choice("Keep the deposit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(button("Cancel, keep the deposit")).toBeTruthy();
        act(() => choice("Refund ₹400").click());
        await submit("Cancel and refund ₹400");
        expect(cancelBooking).toHaveBeenCalledWith("bk_1", {
            returnCredit: true,
        });
    });

    it("a Member gets the policy's own choice, in time and late (Q14)", async () => {
        // In time: refunded, no role needed.
        await draw({ canRefund: false });
        expect(choice("Refund ₹400").getAttribute("aria-checked")).toBe("true");
        expect(choice("Refund ₹400").disabled).toBe(false);
        // Late: kept; refunding by hand needs refund permission, said why.
        act(() => root.unmount());
        root = createRoot(host);
        await draw({ now: "2026-10-19T06:00:00.000Z", canRefund: false });
        expect(choice("Keep the deposit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(choice("Refund ₹400").disabled).toBe(true);
        expect(sheet().textContent).toContain(
            "Only someone who can refund payments can give it back.",
        );
        await submit("Cancel, keep the deposit");
        expect(cancelBooking).toHaveBeenCalledWith("bk_1", {});
    });

    it("nothing paid: a plain question, then held ten seconds with Undo", async () => {
        await draw({ booking: booking({ money: null }) });
        expect(sheet().querySelector('[role="radiogroup"]')).toBeNull();
        expect(sheet().textContent).toContain(
            "Kabir is told, and the time opens up for someone else.",
        );
        expect(button("Keep booking")).toBeTruthy();
        await submit("Cancel booking");
        expect(onClose).toHaveBeenCalled();
        expect(showUndo).toHaveBeenCalledWith(
            "Cancelling in 10 seconds",
            expect.any(Function),
            expect.anything(),
        );
        // Nothing is written until the ten seconds are up.
        expect(cancelBooking).not.toHaveBeenCalled();
    });

    it("reads what was paid when the screen doesn't hold it (the list)", async () => {
        let answer: (v: unknown) => void = () => undefined;
        readBookingForCancel.mockReturnValue(
            new Promise((r) => {
                answer = r;
            }),
        );
        await draw({ booking: booking({ money: undefined }) });
        expect(readBookingForCancel).toHaveBeenCalledWith("bk_1");
        expect(sheet().textContent).toContain("Checking what was paid…");
        await act(async () => {
            answer({
                money: deposit,
                freeCancelUntil: DEADLINE,
                timezone: ZONE,
            });
            await Promise.resolve();
        });
        expect(choice("Refund ₹400").getAttribute("aria-checked")).toBe("true");
    });

    it("a read that fails says so, cancels nothing, and tries again", async () => {
        readBookingForCancel.mockResolvedValue(null);
        await draw({ booking: booking({ money: undefined }) });
        await act(async () => {
            await Promise.resolve();
        });
        expect(sheet().textContent).toContain("what was paid for it");
        expect(sheet().textContent).toContain(
            "The booking hasn't been cancelled.",
        );
        readBookingForCancel.mockResolvedValue({
            money: null,
            freeCancelUntil: null,
            timezone: ZONE,
        });
        await act(async () => {
            button("Try again").click();
            await Promise.resolve();
        });
        expect(readBookingForCancel).toHaveBeenCalledTimes(2);
    });

    it("a refusal keeps the sheet open, and says why", async () => {
        cancelBooking.mockResolvedValue({
            ok: false,
            error: "Couldn't cancel the booking.",
        });
        await draw();
        await submit("Cancel and refund ₹400");
        expect(showError).toHaveBeenCalledWith("Couldn't cancel the booking.");
        expect(onClose).not.toHaveBeenCalled();
    });

    it("is a bottom sheet on a phone and a right-hand panel at a desk", async () => {
        await draw();
        expect(sheet().className).toContain("sm:max-w-lg");
        expect(sheet().className).not.toContain("rounded-t-[18px]");
        act(() => root.unmount());
        root = createRoot(host);
        phone(true);
        await draw();
        expect(sheet().className).toContain("rounded-t-[18px]");
        expect(sheet().className).toContain("slide-in-from-bottom");
        // Toasts said while it is open rise above its foot (BA-23).
        const inset = () =>
            document.documentElement.style.getPropertyValue(
                "--overlay-foot-inset",
            );
        expect(inset()).toMatch(/^\d+px$/);
        await draw({ open: false });
        expect(inset()).toBe("");
    });

    it("at a desk, leaves the toasts where they are", async () => {
        await draw();
        expect(
            document.documentElement.style.getPropertyValue(
                "--overlay-foot-inset",
            ),
        ).toBe("");
    });

    it("starts the keyboard on the money choice; Escape keeps the booking", async () => {
        await draw({ open: false });
        await draw({ open: true });
        // In the money question, not on the destructive button.
        const group = sheet().querySelector('[role="radiogroup"]');
        expect(group?.contains(document.activeElement)).toBe(true);
        act(() => {
            sheet().dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(onClose).toHaveBeenCalled();
        expect(cancelBooking).not.toHaveBeenCalled();
    });
});
