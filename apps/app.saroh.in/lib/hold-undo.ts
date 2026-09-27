/**
 * The ten-second hold: something is done, or about to be, and for ten seconds
 * it can be taken back (round-2 default 136). One helper so every screen's
 * Undo times out the same way, and so none of them grows a timer of its own
 * (overview, "One owner per shared helper").
 *
 * Pure: no React, no DOM, no toast. A screen draws the hold however it likes
 * (a toast, a countdown bar) and tells it when the merchant presses Undo, asks
 * for it now, or leaves.
 *
 * Its callers do different things during the hold, and the helper serves all
 * three through two callbacks:
 *
 * - **Done at once, undone on request** — the site editor (G3). The draft
 *   has already changed and autosaves as usual; `undo` puts the previous
 *   draft back, and there is nothing to `commit`.
 * - **Nothing done until the hold ends** — Home's message-sending actions
 *   (F4) and Order Detail's Ready and refund (ADR-008). `commit` makes the
 *   call when the ten seconds are up, on "Send now", or when the page is
 *   left; Undo means it is never made, so there is no `undo` callback.
 * - **Held on the server** — Orders' bulk moves (B6). The server holds the
 *   batch and its own job commits it, so the page only counts down: "Send
 *   now" is `commit`, "Undo all" is `undo`, and leaving drops the local
 *   clock (`onLeave: "drop"`) because the server finishes without it.
 *
 * Rules every caller gets:
 *
 * - Exactly one of `commit` or `undo` runs, once. Undo after the hold has
 *   started committing is refused (`false`), never half-done.
 * - A callback that throws or rejects ends the hold as `failed`, with the
 *   error and which step it was, and never as an unhandled rejection. The
 *   caller says what failed; the helper has no words of its own.
 * - `createHoldSlot` keeps one hold at a time: a new one ends the last one
 *   (committing it), so there are never two Undos for two different things.
 */

/** How long anything can be undone: ten seconds (round-2 default 136). */
export const HOLD_UNDO_MS = 10_000;

/** Why a hold stopped waiting and committed. */
export type HoldEndReason =
    /** The ten seconds ran out. */
    | "timeout"
    /** The caller asked for it now: "Send now", or a later edit closed the window. */
    | "now"
    /** The page is going away. */
    | "leave"
    /** A newer hold took its place in the slot. */
    | "replaced";

export type HoldState =
    | { status: "held"; until: number }
    | { status: "committing"; reason: HoldEndReason }
    | { status: "committed"; reason: HoldEndReason }
    | { status: "undoing" }
    | { status: "undone" }
    /** Left with `onLeave: "drop"`: neither callback ran here. */
    | { status: "dropped" }
    | { status: "failed"; during: "commit" | "undo"; error: unknown };

/** The clock, injectable so the hold can be tested without waiting. */
export interface HoldClock {
    now: () => number;
    setTimeout: (run: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
}

const REAL_CLOCK: HoldClock = {
    now: () => Date.now(),
    setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: (id) =>
        globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface HoldOptions {
    /**
     * What happens when the hold ends without Undo: the ten seconds run out,
     * `commitNow`, a newer hold replaces it, or the page is left (unless
     * `onLeave` is "drop"). Omit it when the thing is already done.
     */
    commit?: () => void | Promise<void>;
    /** What Undo does. Omit it when nothing was done yet: Undo then only stops the commit. */
    undo?: () => void | Promise<void>;
    /**
     * Leaving the page mid-hold. "commit" (the default) runs `commit` now —
     * the merchant did not press Undo, so what they asked for happens.
     * "drop" stops the local clock and runs neither: for a hold something
     * else finishes, like a batch the server commits itself.
     */
    onLeave?: "commit" | "drop";
    /** Only for tests and for a rule of its own; the product rule is ten seconds. */
    durationMs?: number;
    /** Every change of state, for whatever draws the hold. */
    onChange?: (state: HoldState) => void;
    clock?: HoldClock;
}

export interface Hold {
    state: () => HoldState;
    /** Time left in the window, never below 0; 0 once it has ended. */
    remainingMs: () => number;
    /** Undo, if it still can be. `true` once undone. */
    undo: () => Promise<boolean>;
    /** End the hold now and commit. `true` once committed. */
    commitNow: () => Promise<boolean>;
    /** The page is going away: commit or drop, as `onLeave` says. */
    leave: () => Promise<void>;
    /** Replaced by a newer hold: commit now, as the slot does. */
    replace: () => Promise<boolean>;
}

/** Whole seconds left, for a countdown: 10, 9, … 1. */
export function secondsLeft(remainingMs: number): number {
    return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** Start the ten-second hold. */
export function startHold(options: HoldOptions = {}): Hold {
    const clock = options.clock ?? REAL_CLOCK;
    const duration = options.durationMs ?? HOLD_UNDO_MS;
    let state: HoldState = { status: "held", until: clock.now() + duration };
    let timer: unknown = clock.setTimeout(() => {
        timer = null;
        void end("timeout");
    }, duration);

    function set(next: HoldState) {
        state = next;
        options.onChange?.(next);
    }

    function stopClock() {
        if (timer !== null) clock.clearTimeout(timer);
        timer = null;
    }

    async function end(reason: HoldEndReason): Promise<boolean> {
        if (state.status !== "held") return false;
        stopClock();
        set({ status: "committing", reason });
        try {
            await options.commit?.();
        } catch (error) {
            set({ status: "failed", during: "commit", error });
            return false;
        }
        set({ status: "committed", reason });
        return true;
    }

    return {
        state: () => state,
        remainingMs: () =>
            state.status === "held"
                ? Math.max(0, state.until - clock.now())
                : 0,
        async undo() {
            if (state.status !== "held") return false;
            stopClock();
            set({ status: "undoing" });
            try {
                await options.undo?.();
            } catch (error) {
                set({ status: "failed", during: "undo", error });
                return false;
            }
            set({ status: "undone" });
            return true;
        },
        commitNow: () => end("now"),
        replace: () => end("replaced"),
        async leave() {
            if (state.status !== "held") return;
            if (options.onLeave === "drop") {
                stopClock();
                set({ status: "dropped" });
                return;
            }
            await end("leave");
        },
    };
}

/**
 * One hold at a time. Starting a hold ends the one before it by committing
 * it, which is what the merchant expects of an action they did not undo, and
 * leaves a single Undo on screen: the one for the last thing done.
 */
export interface HoldSlot {
    start: (options: HoldOptions) => Hold;
    /** The hold still in its window, if any. */
    current: () => Hold | null;
    undo: () => Promise<boolean>;
    commitNow: () => Promise<boolean>;
    leave: () => Promise<void>;
}

export function createHoldSlot(): HoldSlot {
    let hold: Hold | null = null;
    const live = () =>
        hold !== null && hold.state().status === "held" ? hold : null;
    return {
        start(options) {
            void live()?.replace();
            hold = startHold(options);
            return hold;
        },
        current: live,
        undo: () => live()?.undo() ?? Promise.resolve(false),
        commitNow: () => live()?.commitNow() ?? Promise.resolve(false),
        leave: () => live()?.leave() ?? Promise.resolve(),
    };
}
