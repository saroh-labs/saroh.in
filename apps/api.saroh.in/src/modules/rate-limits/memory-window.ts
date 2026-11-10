/**
 * The rate-limit rule both windows share (plan 2026-11-10-001, U4): GCRA, a
 * sliding window that lets `cap` calls through in any rolling minute with
 * no burst at the minute's edge. One number is kept per (scope, id): the
 * "theoretical arrival time" (TAT) at which the bucket is full again.
 * `redis-window.ts` runs the same step in Lua so replicas share it.
 */

export const WINDOW_MS = 60_000;

export interface LimitDecision {
    allowed: boolean;
    /** Calls left in the rolling window after this one. */
    remaining: number;
    /** Epoch ms: refused, when one call frees up; allowed, when the window is full again. */
    resetAt: number;
}

export interface GcraStep extends LimitDecision {
    /** The TAT to store: moved on when allowed, unchanged when refused. */
    tat: number;
}

/** One call against a stored TAT (null for a key never seen, or expired). */
export function gcraStep(
    stored: number | null,
    now: number,
    cap: number,
    windowMs = WINDOW_MS,
): GcraStep {
    // A cap of 0 (the surface is off on the plan) refuses everything.
    if (cap <= 0) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: now + windowMs,
            tat: stored ?? now,
        };
    }
    // Whole ms throughout, so Redis's text and Lua's numbers never round a
    // call into a refusal; the burst is exactly `cap`, refilling one per
    // `interval` (a hair faster than cap a minute when 60000 / cap isn't whole).
    const { interval, burst } = gcraShape(cap, windowMs);
    const tat = Math.max(stored ?? now, now);
    const next = tat + interval;
    const allowAt = next - burst;
    if (allowAt > now) {
        return { allowed: false, remaining: 0, resetAt: allowAt, tat };
    }
    const remaining = Math.floor((burst - (next - now)) / interval);
    return { allowed: true, remaining, resetAt: next, tat: next };
}

/** One call's spacing and the burst a full window holds, in whole ms. */
export function gcraShape(
    cap: number,
    windowMs = WINDOW_MS,
): { interval: number; burst: number } {
    const interval = Math.max(1, Math.floor(windowMs / cap));
    return { interval, burst: interval * cap };
}

/** How many keys may pile up before `take` sweeps the full-again ones. */
const SWEEP_AT = 10_000;

/**
 * The in-process window, used when Redis is unset or failing. Per replica,
 * so callers pass the cap already divided by the replica count.
 */
export class MemoryWindow {
    private readonly tats = new Map<string, number>();

    take(key: string, cap: number, now: number = Date.now()): LimitDecision {
        if (this.tats.size >= SWEEP_AT) {
            for (const [k, tat] of this.tats) {
                if (tat <= now) this.tats.delete(k);
            }
        }
        const step = gcraStep(this.tats.get(key) ?? null, now, cap);
        if (step.allowed) this.tats.set(key, step.tat);
        return {
            allowed: step.allowed,
            remaining: step.remaining,
            resetAt: step.resetAt,
        };
    }
}
