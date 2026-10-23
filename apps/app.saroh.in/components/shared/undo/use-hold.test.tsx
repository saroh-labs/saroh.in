// @vitest-environment jsdom
/**
 * The shared ten-second hold with its Undo toast (`useHold`): nothing is
 * written until the hold ends, Undo drops it, and anything that tells a
 * customer says "Sending in 10 seconds" and then "Sent to …".
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNREACHED } from "@/lib/api/unreached";
import { HOLD_UNDO_MS } from "@/lib/hold-undo";
import { NOT_SENT, SENDING_SOON, useHold } from "./use-hold";

const showUndo = vi.fn();
const showSuccess = vi.fn();
const showError = vi.fn();
const dismissToast = vi.fn();
const settleUndo = vi.fn(async (undo: () => unknown) => {
    await undo();
    return true;
});
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...args: unknown[]) => showUndo(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
    dismissToast: (...args: unknown[]) => dismissToast(...args) as unknown,
    settleUndo: (undo: () => unknown) => settleUndo(undo),
}));

let root: Root;
/** The hook as the last render returned it. */
const seen: { api: ReturnType<typeof useHold> | null } = { api: null };
const api = new Proxy({} as ReturnType<typeof useHold>, {
    get: (_t, key: keyof ReturnType<typeof useHold>) => {
        if (!seen.api) throw new Error("Not rendered yet");
        return seen.api[key];
    },
});

function Probe() {
    const hold = useHold();
    useEffect(() => {
        seen.api = hold;
    });
    return <output>{hold.pending.join(",")}</output>;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    for (const m of [showUndo, showSuccess, showError, dismissToast])
        m.mockReset();
    showUndo.mockReturnValue("toast-1");
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Probe />));
});

afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    document.body.innerHTML = "";
});

const pending = () => document.querySelector("output")?.textContent;
const run = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
/** The Undo on the toast, as it was handed to `showUndo`. */
const toastUndo = () =>
    (showUndo.mock.calls[0]?.[1] as () => Promise<boolean>)();

describe("useHold", () => {
    it("writes nothing for ten seconds, then commits once", async () => {
        const commit = vi.fn();
        act(() => api.hold("k", "Invitation cancelled.", commit));
        expect(showUndo.mock.calls[0]?.[0]).toBe("Invitation cancelled.");
        expect(pending()).toBe("k");
        await run(HOLD_UNDO_MS - 1);
        expect(commit).not.toHaveBeenCalled();
        await run(1);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(pending()).toBe("");
        expect(dismissToast).toHaveBeenCalledWith("toast-1");
    });

    it("lasts the one ten seconds, the toast's own default", () => {
        expect(HOLD_UNDO_MS).toBe(10_000);
        act(() => api.hold("k", "Held.", vi.fn()));
        // No duration of its own: the toast's default is the same ten.
        expect(showUndo.mock.calls[0]?.[2]).toEqual({
            description: undefined,
        });
    });

    it("Undo drops it: nothing is ever written, and the screen is put back", async () => {
        const commit = vi.fn();
        const back = vi.fn();
        act(() => api.hold("k", "Held.", commit, back));
        let undone = false;
        await act(async () => {
            undone = await toastUndo();
        });
        expect(undone).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
        await run(HOLD_UNDO_MS * 2);
        expect(commit).not.toHaveBeenCalled();
        expect(pending()).toBe("");
    });

    it("the screen's own Undo is the toast's, by key", async () => {
        const commit = vi.fn();
        const back = vi.fn();
        act(() => api.hold("k", "Held.", commit, back));
        await act(async () => {
            api.undo("k");
            await Promise.resolve();
        });
        expect(settleUndo).toHaveBeenCalledTimes(1);
        expect(back).toHaveBeenCalledTimes(1);
        await run(HOLD_UNDO_MS);
        expect(commit).not.toHaveBeenCalled();
    });

    it("an Undo too late is refused, not half done", async () => {
        const commit = vi.fn();
        act(() => api.hold("k", "Held.", commit));
        await run(HOLD_UNDO_MS);
        let undone = true;
        await act(async () => {
            undone = await toastUndo();
        });
        expect(undone).toBe(false);
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it("leaving the page makes what is held happen", async () => {
        const commit = vi.fn();
        act(() => api.hold("k", "Held.", commit));
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it("the same thing held again lets the first one stand", async () => {
        const first = vi.fn();
        const second = vi.fn();
        act(() => api.hold("k", "One.", first));
        await act(async () => {
            api.hold("k", "Two.", second);
            await Promise.resolve();
        });
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
        await run(HOLD_UNDO_MS);
        expect(second).toHaveBeenCalledTimes(1);
    });
});

describe("useHold: a commit that fails", () => {
    it("a commit that throws puts the screen back and says so", async () => {
        const back = vi.fn();
        act(() =>
            api.hold(
                "k",
                "Held.",
                () => Promise.reject(new Error("offline")),
                back,
            ),
        );
        await run(HOLD_UNDO_MS);
        expect(back).toHaveBeenCalledTimes(1);
        expect(showError).toHaveBeenCalledWith(UNREACHED);
        expect(pending()).toBe("");
    });

    it("a refused commit puts the screen back with the API's reason", async () => {
        const back = vi.fn();
        act(() =>
            api.hold(
                "k",
                "Held.",
                () => Promise.resolve({ ok: false, error: "Already started." }),
                back,
            ),
        );
        await run(HOLD_UNDO_MS);
        expect(back).toHaveBeenCalledTimes(1);
        expect(showError).toHaveBeenCalledWith("Already started.");
    });

    it("a commit that went through leaves the screen as it is", async () => {
        const back = vi.fn();
        act(() =>
            api.hold("k", "Held.", () => Promise.resolve({ ok: true }), back),
        );
        await run(HOLD_UNDO_MS);
        expect(back).not.toHaveBeenCalled();
        expect(showError).not.toHaveBeenCalled();
    });
});

describe("useHold: what tells a customer", () => {
    it("says Sending in 10 seconds, then Sent to them", async () => {
        const sent = vi.fn();
        act(() =>
            api.send("k", {
                description: "By email.",
                run: () => Promise.resolve({ ok: true }),
                sent: "Sent to Priya.",
                onSent: sent,
            }),
        );
        expect(showUndo.mock.calls[0]?.[0]).toBe(SENDING_SOON);
        expect(SENDING_SOON).toBe("Sending in 10 seconds");
        expect(showUndo.mock.calls[0]?.[2]).toEqual({
            description: "By email.",
        });
        expect(showSuccess).not.toHaveBeenCalled();
        await run(HOLD_UNDO_MS);
        expect(showSuccess).toHaveBeenCalledWith("Sent to Priya.", undefined);
        expect(sent).toHaveBeenCalledTimes(1);
    });

    it("says a refusal, and puts the screen back", async () => {
        const back = vi.fn();
        act(() =>
            api.send("k", {
                run: () =>
                    Promise.resolve({ ok: false, error: "No provider." }),
                sent: "Sent to Priya.",
                onBack: back,
            }),
        );
        await run(HOLD_UNDO_MS);
        expect(showError).toHaveBeenCalledWith(NOT_SENT, "No provider.");
        expect(showSuccess).not.toHaveBeenCalled();
        expect(back).toHaveBeenCalledTimes(1);
    });

    it("says nothing twice when the caller already said the refusal", async () => {
        act(() =>
            api.send("k", {
                run: () =>
                    Promise.resolve({ ok: false, error: "x", said: true }),
                sent: "Sent.",
            }),
        );
        await run(HOLD_UNDO_MS);
        expect(showError).not.toHaveBeenCalled();
    });

    it("Undo sends nothing and puts the screen back", async () => {
        const runIt = vi.fn(() => Promise.resolve({ ok: true as const }));
        const back = vi.fn();
        act(() => api.send("k", { run: runIt, sent: "Sent.", onBack: back }));
        await act(async () => {
            await toastUndo();
        });
        await run(HOLD_UNDO_MS);
        expect(runIt).not.toHaveBeenCalled();
        expect(back).toHaveBeenCalledTimes(1);
    });
});
