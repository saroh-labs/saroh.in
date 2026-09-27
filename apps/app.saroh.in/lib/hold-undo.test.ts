import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HoldClock, HoldState } from "./hold-undo";
import {
    createHoldSlot,
    HOLD_UNDO_MS,
    secondsLeft,
    startHold,
} from "./hold-undo";

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

/** Let the callbacks' promises settle after a timer fires. */
async function settle() {
    await Promise.resolve();
    await Promise.resolve();
}

describe("startHold", () => {
    it("holds for ten seconds, then commits once", async () => {
        const commit = vi.fn();
        const undo = vi.fn();
        const hold = startHold({ commit, undo });
        expect(HOLD_UNDO_MS).toBe(10_000);
        expect(hold.state().status).toBe("held");
        expect(hold.remainingMs()).toBe(10_000);

        vi.advanceTimersByTime(9_999);
        expect(commit).not.toHaveBeenCalled();
        expect(hold.remainingMs()).toBe(1);

        vi.advanceTimersByTime(1);
        await settle();
        expect(commit).toHaveBeenCalledTimes(1);
        expect(undo).not.toHaveBeenCalled();
        expect(hold.state()).toEqual({
            status: "committed",
            reason: "timeout",
        });
        expect(hold.remainingMs()).toBe(0);

        vi.advanceTimersByTime(60_000);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it("undoes within the window, and the commit never runs", async () => {
        const commit = vi.fn();
        const undo = vi.fn();
        const hold = startHold({ commit, undo });
        vi.advanceTimersByTime(9_000);
        expect(await hold.undo()).toBe(true);
        expect(undo).toHaveBeenCalledTimes(1);
        expect(hold.state().status).toBe("undone");

        vi.advanceTimersByTime(5_000);
        await settle();
        expect(commit).not.toHaveBeenCalled();
        // A second press does nothing.
        expect(await hold.undo()).toBe(false);
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it("refuses Undo once the window has closed", async () => {
        const undo = vi.fn();
        const hold = startHold({ undo });
        vi.advanceTimersByTime(HOLD_UNDO_MS);
        await settle();
        expect(await hold.undo()).toBe(false);
        expect(undo).not.toHaveBeenCalled();
    });

    it("refuses Undo while the commit is in flight", async () => {
        let finish: () => void = () => undefined;
        const commit = vi.fn(
            () => new Promise<void>((resolve) => (finish = resolve)),
        );
        const undo = vi.fn();
        const hold = startHold({ commit, undo });
        const now = hold.commitNow();
        expect(hold.state()).toEqual({ status: "committing", reason: "now" });
        expect(await hold.undo()).toBe(false);
        finish();
        expect(await now).toBe(true);
        expect(undo).not.toHaveBeenCalled();
        expect(hold.state()).toEqual({ status: "committed", reason: "now" });
    });

    it("commits now on request, and the clock no longer fires", async () => {
        const commit = vi.fn();
        const hold = startHold({ commit });
        expect(await hold.commitNow()).toBe(true);
        vi.advanceTimersByTime(HOLD_UNDO_MS);
        await settle();
        expect(commit).toHaveBeenCalledTimes(1);
        expect(await hold.commitNow()).toBe(false);
    });

    it("commits when the page is left, by default", async () => {
        const commit = vi.fn();
        const hold = startHold({ commit });
        await hold.leave();
        expect(commit).toHaveBeenCalledTimes(1);
        expect(hold.state()).toEqual({ status: "committed", reason: "leave" });
    });

    it("drops the clock on leaving when something else finishes the hold", async () => {
        const commit = vi.fn();
        const undo = vi.fn();
        const hold = startHold({ commit, undo, onLeave: "drop" });
        await hold.leave();
        vi.advanceTimersByTime(HOLD_UNDO_MS);
        await settle();
        expect(commit).not.toHaveBeenCalled();
        expect(undo).not.toHaveBeenCalled();
        expect(hold.state().status).toBe("dropped");
    });

    it("ends as failed, never as an unhandled rejection, when the commit fails", async () => {
        const error = new Error("offline");
        const onChange = vi.fn();
        const hold = startHold({
            commit: () => Promise.reject(error),
            onChange,
        });
        vi.advanceTimersByTime(HOLD_UNDO_MS);
        await settle();
        await settle();
        expect(hold.state()).toEqual({
            status: "failed",
            during: "commit",
            error,
        });
        expect(onChange).toHaveBeenLastCalledWith({
            status: "failed",
            during: "commit",
            error,
        });
        // Nothing left to undo.
        expect(await hold.undo()).toBe(false);
    });

    it("ends as failed when Undo fails, and does not commit after it", async () => {
        const commit = vi.fn();
        const hold = startHold({
            commit,
            undo: () => {
                throw new Error("refused");
            },
        });
        expect(await hold.undo()).toBe(false);
        expect(hold.state()).toMatchObject({
            status: "failed",
            during: "undo",
        });
        vi.advanceTimersByTime(HOLD_UNDO_MS);
        await settle();
        expect(commit).not.toHaveBeenCalled();
    });

    it("tells whatever draws it every change of state", async () => {
        const seen: HoldState["status"][] = [];
        const hold = startHold({ onChange: (s) => seen.push(s.status) });
        await hold.undo();
        expect(seen).toEqual(["undoing", "undone"]);
    });

    it("runs on an injected clock", async () => {
        let now = 1_000;
        let fire: (() => void) | null = null;
        const clock: HoldClock = {
            now: () => now,
            setTimeout: (run) => {
                fire = run;
                return 1;
            },
            clearTimeout: () => {
                fire = null;
            },
        };
        const commit = vi.fn();
        const hold = startHold({ commit, clock });
        now = 4_500;
        expect(hold.remainingMs()).toBe(6_500);
        expect(secondsLeft(hold.remainingMs())).toBe(7);
        (fire as (() => void) | null)?.();
        await settle();
        expect(commit).toHaveBeenCalledTimes(1);
    });
});

describe("secondsLeft", () => {
    it("counts whole seconds down to 1, then 0", () => {
        expect(secondsLeft(10_000)).toBe(10);
        expect(secondsLeft(9_001)).toBe(10);
        expect(secondsLeft(9_000)).toBe(9);
        expect(secondsLeft(1)).toBe(1);
        expect(secondsLeft(0)).toBe(0);
        expect(secondsLeft(-50)).toBe(0);
    });
});

describe("createHoldSlot", () => {
    it("keeps one hold: a new one commits the last, and only the new one can be undone", async () => {
        const slot = createHoldSlot();
        const first = { commit: vi.fn(), undo: vi.fn() };
        const second = { commit: vi.fn(), undo: vi.fn() };
        const a = slot.start(first);
        const b = slot.start(second);
        await settle();
        expect(a.state()).toEqual({ status: "committed", reason: "replaced" });
        expect(first.commit).toHaveBeenCalledTimes(1);
        expect(slot.current()).toBe(b);

        expect(await slot.undo()).toBe(true);
        expect(second.undo).toHaveBeenCalledTimes(1);
        expect(first.undo).not.toHaveBeenCalled();
        expect(slot.current()).toBeNull();
        expect(await slot.undo()).toBe(false);
    });

    it("has nothing current once the window runs out", async () => {
        const slot = createHoldSlot();
        slot.start({});
        vi.advanceTimersByTime(HOLD_UNDO_MS);
        await settle();
        expect(slot.current()).toBeNull();
        await slot.leave();
        expect(await slot.commitNow()).toBe(false);
    });

    it("commits the current hold when the page is left", async () => {
        const slot = createHoldSlot();
        const commit = vi.fn();
        slot.start({ commit });
        await slot.leave();
        expect(commit).toHaveBeenCalledTimes(1);
        expect(slot.current()).toBeNull();
    });
});
