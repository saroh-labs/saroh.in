import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Autosave } from "./autosave";
import type { SaveState } from "./state";
import type { EditorResult } from "./types";

interface V {
    name: string;
    price: string;
}
interface R {
    revision: number;
}

/** A save the test answers by hand. */
function deferred() {
    let resolve!: (r: EditorResult<R>) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<EditorResult<R>>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function setup(opts: { ready?: (v: V) => boolean } = {}) {
    const calls: { values: V; revision: number | null }[] = [];
    const answers: ReturnType<typeof deferred>[] = [];
    const states: SaveState[] = [];
    const saved: V[] = [];
    const a = new Autosave<V, R>(
        {
            values: { name: "Monthly", price: "1200" },
            revision: 4,
            delayMs: 800,
            onState: (s) => states.push(s),
        },
        {
            ready: opts.ready ?? (() => true),
            send: (values, revision) => {
                calls.push({ values, revision });
                const d = deferred();
                answers.push(d);
                return d.promise;
            },
            onSaved: (_r, v) => saved.push(v),
        },
    );
    return { a, calls, answers, states, saved };
}

/** Let the promise chain after an answer run. */
async function settle() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("autosave", () => {
    it("waits about 800 ms after the last keystroke, then sends once", async () => {
        const { a, calls, answers } = setup();
        a.edit({ name: "M", price: "1200" });
        vi.advanceTimersByTime(500);
        a.edit({ name: "Mo", price: "1200" });
        vi.advanceTimersByTime(500);
        expect(calls).toHaveLength(0);
        expect(a.snapshot.phase).toBe("dirty");
        vi.advanceTimersByTime(300);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            values: { name: "Mo", price: "1200" },
            revision: 4,
        });
        expect(a.snapshot.phase).toBe("saving");
        answers[0].resolve({ ok: true, data: { revision: 5 } });
        await settle();
        expect(a.snapshot.phase).toBe("saved");
        expect(a.snapshot.revision).toBe(5);
        expect(a.lastSaved).toEqual({ name: "Mo", price: "1200" });
    });

    it("sends one save at a time; an edit made meanwhile goes with the next, on the new revision", async () => {
        const { a, calls, answers } = setup();
        a.edit({ name: "A", price: "1" });
        vi.advanceTimersByTime(800);
        a.edit({ name: "AB", price: "1" });
        vi.advanceTimersByTime(2000);
        expect(calls).toHaveLength(1);
        answers[0].resolve({ ok: true, data: { revision: 5 } });
        await settle();
        expect(a.snapshot.phase).toBe("dirty");
        vi.advanceTimersByTime(800);
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual({
            values: { name: "AB", price: "1" },
            revision: 5,
        });
    });

    it("flush saves at once (blur, leaving) and says whether everything is on the server", async () => {
        const { a, calls, answers } = setup();
        a.edit({ name: "A", price: "1" });
        const done = a.flush();
        expect(calls).toHaveLength(1);
        answers[0].resolve({ ok: true, data: { revision: 5 } });
        await expect(done).resolves.toBe(true);
        // Nothing was waiting: flush is quiet.
        await expect(a.flush()).resolves.toBe(true);
        expect(calls).toHaveLength(1);
    });

    it("flush waits for a save that is out, then sends the edit made meanwhile", async () => {
        const { a, calls, answers } = setup();
        a.edit({ name: "A", price: "1" });
        vi.advanceTimersByTime(800);
        a.edit({ name: "AB", price: "1" });
        const done = a.flush();
        answers[0].resolve({ ok: true, data: { revision: 5 } });
        await settle();
        expect(calls).toHaveLength(2);
        answers[1].resolve({ ok: true, data: { revision: 6 } });
        await expect(done).resolves.toBe(true);
        expect(a.snapshot.revision).toBe(6);
    });

    it("a failure keeps the edits, says Not saved, and doesn't retry until Try again or the next edit", async () => {
        const { a, calls, answers, saved } = setup();
        a.edit({ name: "A", price: "1500" });
        vi.advanceTimersByTime(800);
        answers[0].resolve({
            ok: false,
            error: "Price must be more than zero",
            field: "price",
        });
        await settle();
        expect(a.snapshot.phase).toBe("failed");
        expect(a.snapshot.errorField).toBe("price");
        expect(a.values).toEqual({ name: "A", price: "1500" });
        expect(saved).toHaveLength(0);
        vi.advanceTimersByTime(10_000);
        expect(calls).toHaveLength(1);
        // Leaving asks: flush doesn't pretend it saved.
        await expect(a.flush()).resolves.toBe(false);
        expect(calls).toHaveLength(1);

        const retried = a.retry();
        expect(calls).toHaveLength(2);
        answers[1].resolve({ ok: true, data: { revision: 5 } });
        await expect(retried).resolves.toBe(true);
        expect(a.snapshot.phase).toBe("saved");
    });

    it("an unreachable API is a failure, not a hang on Saving…", async () => {
        const { a, answers } = setup();
        a.edit({ name: "A", price: "1" });
        vi.advanceTimersByTime(800);
        answers[0].reject(new Error("fetch failed"));
        await settle();
        expect(a.snapshot.phase).toBe("failed");
        expect(a.snapshot.error).toMatch(/Couldn't reach Saroh/);
    });

    it("a 409 stops the loop: nothing more is sent until Reload", async () => {
        const { a, calls, answers } = setup();
        a.edit({ name: "A", price: "1" });
        vi.advanceTimersByTime(800);
        answers[0].resolve({
            ok: false,
            error: "Someone else changed this plan",
            conflict: { changedBy: "Priya", changedAt: null, current: 5 },
        });
        await settle();
        expect(a.snapshot.phase).toBe("conflict");
        expect(a.snapshot.conflict?.changedBy).toBe("Priya");
        a.edit({ name: "AB", price: "1" });
        a.edit({ name: "ABC", price: "1" });
        vi.advanceTimersByTime(10_000);
        await expect(a.flush()).resolves.toBe(false);
        expect(calls).toHaveLength(1);
        // The typed values stay on screen.
        expect(a.values).toEqual({ name: "ABC", price: "1" });

        a.reset({ name: "Priya's", price: "1500" }, 5);
        expect(a.snapshot.phase).toBe("idle");
        a.edit({ name: "Priya's plan", price: "1500" });
        vi.advanceTimersByTime(800);
        expect(calls).toHaveLength(2);
        expect(calls[1].revision).toBe(5);
    });

    it("doesn't save until the values are enough to (a new record needs a name)", async () => {
        const { a, calls, answers } = setup({ ready: (v) => !!v.name.trim() });
        a.edit({ name: "", price: "1" });
        vi.advanceTimersByTime(2000);
        await expect(a.flush()).resolves.toBe(false);
        expect(calls).toHaveLength(0);
        a.edit({ name: "Monthly", price: "1" });
        vi.advanceTimersByTime(800);
        expect(calls).toHaveLength(1);
        answers[0].resolve({ ok: true, data: { revision: 1 } });
        await settle();
        expect(a.snapshot.phase).toBe("saved");
    });

    it("a save still out when the screen is reset doesn't count as saving the new values", async () => {
        const { a, answers, saved } = setup();
        a.edit({ name: "A", price: "1" });
        vi.advanceTimersByTime(800);
        a.reset({ name: "Server", price: "2" }, 7);
        answers[0].resolve({ ok: true, data: { revision: 6 } });
        await settle();
        expect(saved).toHaveLength(0);
        expect(a.lastSaved).toEqual({ name: "Server", price: "2" });
        expect(a.snapshot.revision).toBe(7);
        expect(a.snapshot.phase).toBe("idle");
    });

    it("idle waits for the save that is out and sends nothing new (before Discard)", async () => {
        const { a, calls, answers } = setup();
        a.edit({ name: "A", price: "1" });
        vi.advanceTimersByTime(800);
        a.edit({ name: "AB", price: "1" });
        const idle = a.idle();
        answers[0].resolve({ ok: true, data: { revision: 5 } });
        await idle;
        vi.advanceTimersByTime(5000);
        expect(calls).toHaveLength(1);
    });

    it("stops its timer when disposed", () => {
        const { a, calls } = setup();
        a.edit({ name: "A", price: "1" });
        a.dispose();
        vi.advanceTimersByTime(5000);
        expect(calls).toHaveLength(0);
    });
});
