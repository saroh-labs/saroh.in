// @vitest-environment jsdom
/**
 * The calendar's held actions: a refused or unreached write puts back only
 * its own mark, the Came toast asks for what is still to take, and a
 * cancel is late by the business's free-cancel rule, whoever takes it
 * (free cancelling follows the business's refund policy; DEC-170).
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNREACHED } from "@/lib/api/unreached";
import { HOLD_UNDO_MS } from "@/lib/hold-undo";
import type { DiaryBooking } from "@/lib/services/booking-calendar";

import { useCalendarActions } from "./use-calendar-actions";

const showUndo = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...args: unknown[]) => showUndo(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
const recordBookingOutcome = vi.fn();
const cancelBooking = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    recordBookingOutcome: (...args: unknown[]) =>
        recordBookingOutcome(...args) as unknown,
    cancelBooking: (...args: unknown[]) => cancelBooking(...args) as unknown,
}));

const IST = "Asia/Kolkata";
const START = "2026-10-20T10:00:00.000Z";
const booking = (extra: Partial<DiaryBooking> = {}): DiaryBooking =>
    ({
        id: "b1",
        startAt: START,
        endAt: START,
        status: "CONFIRMED",
        outcome: null,
        bookerName: "Tariq Ali",
        cancelledLate: false,
        service: {
            id: "svc",
            name: "Haircut",
            capacity: 1,
            priceCents: 50_000,
            currency: "INR",
        },
        contact: null,
        staff: { id: "asha", name: "Asha Rao" },
        paidWith: "DESK",
        ...extra,
    }) as unknown as DiaryBooking;

type Api = ReturnType<typeof useCalendarActions>;
const seen: { api: Api | null } = { api: null };
const api = () => {
    if (!seen.api) throw new Error("Not rendered");
    return seen.api;
};

function Probe({ now, money }: { now: number; money: boolean }) {
    const actions = useCalendarActions({
        now,
        timezone: IST,
        money,
        rules: {
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: 24,
        },
    });
    useEffect(() => {
        seen.api = actions;
    });
    return null;
}

let root: Root;
const draw = (now = Date.parse("2026-10-20T00:00:00Z"), money = true) =>
    act(() => root.render(<Probe now={now} money={money} />));
const run = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    showUndo.mockReset();
    showError.mockReset();
    recordBookingOutcome.mockReset();
    cancelBooking.mockReset();
    root = createRoot(document.createElement("div"));
});

afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
});

describe("a held mark that fails", () => {
    it("a Came that never got there is taken off the screen, and said", async () => {
        recordBookingOutcome.mockRejectedValue(new Error("offline"));
        draw();
        act(() => api().act.checkIn(booking()));
        expect(api().overrides.b1).toEqual({ outcome: "ATTENDED" });
        await run(HOLD_UNDO_MS);
        expect(api().overrides.b1).toBeUndefined();
        expect(showError).toHaveBeenCalledWith(UNREACHED);
    });

    it("a refused first mark leaves the newer one on screen", async () => {
        let refuse: (v: unknown) => void = () => undefined;
        recordBookingOutcome
            .mockImplementationOnce(
                () =>
                    new Promise((r) => {
                        refuse = r;
                    }),
            )
            .mockResolvedValue({ ok: true });
        draw();
        act(() => api().act.checkIn(booking()));
        // Didn't come, inside the ten seconds: the Came commits now.
        act(() => api().act.noShow(booking()));
        expect(api().overrides.b1).toEqual({ outcome: "NO_SHOW" });
        await act(async () => {
            refuse({ ok: false, error: "Couldn't mark that." });
            await Promise.resolve();
        });
        expect(showError).toHaveBeenCalledWith("Couldn't mark that.");
        expect(api().overrides.b1).toEqual({ outcome: "NO_SHOW" });
    });
});

describe("the Came toast", () => {
    it("asks for what is still to take, not the full price", () => {
        draw();
        act(() =>
            api().act.checkIn(
                booking({ take: { cents: 20_000, byLink: false } }),
            ),
        );
        expect(showUndo.mock.calls[0]?.[0]).toBe("Tariq came. Take ₹200 now.");
    });

    it("asks for nothing when nothing is due, or money isn't read", () => {
        draw();
        act(() => api().act.checkIn(booking({ take: null })));
        expect(showUndo.mock.calls[0]?.[0]).toBe("Tariq came.");
        act(() => root.unmount());
        root = createRoot(document.createElement("div"));
        draw(undefined, false);
        act(() =>
            api().act.checkIn(
                booking({ take: { cents: 20_000, byLink: false } }),
            ),
        );
        expect(showUndo.mock.calls[1]?.[0]).toBe("Tariq came.");
    });
});

describe("cancel", () => {
    it("is late by the business's rule, whoever takes it", () => {
        // Five hours before Asha's booking: inside the business's 24.
        draw(Date.parse(START) - 5 * 3_600_000);
        act(() => api().act.cancel(booking()));
        expect(api().overrides.b1).toEqual({
            status: "CANCELLED",
            cancelledLate: true,
        });
    });

    it("is free outside the business's rule", () => {
        draw(Date.parse(START) - 25 * 3_600_000);
        act(() => api().act.cancel(booking()));
        expect(api().overrides.b1).toEqual({
            status: "CANCELLED",
            cancelledLate: false,
        });
    });
});
