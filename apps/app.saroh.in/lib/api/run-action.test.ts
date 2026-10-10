/**
 * `runAction`: a server action that throws can never leave a control stuck
 * on "Saving…", and says the one sentence for it. Then a scan of the app's
 * source, so the old shape doesn't come back.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => showError(...a),
}));
const rethrow = vi.fn();
vi.mock("next/navigation", () => ({
    unstable_rethrow: (error: unknown) => rethrow(error),
}));

import { runAction } from "./run-action";
import { UNREACHED } from "./unreached";

describe("runAction", () => {
    beforeEach(() => {
        showError.mockReset();
        rethrow.mockReset();
    });

    it("answers what the action answered, busy on and then off", async () => {
        const setBusy = vi.fn();
        const res = await runAction(
            () => Promise.resolve({ ok: true as const, data: 1 }),
            { setBusy },
        );
        expect(res).toEqual({ ok: true, data: 1 });
        expect(setBusy.mock.calls).toEqual([[true], [false]]);
        expect(showError).not.toHaveBeenCalled();
    });

    it("a thrown action clears busy, says the one sentence once, and answers nothing", async () => {
        const setBusy = vi.fn();
        const res = await runAction(
            () => Promise.reject(new TypeError("Failed to fetch")),
            { setBusy },
        );
        expect(res).toBeUndefined();
        expect(setBusy.mock.calls).toEqual([[true], [false]]);
        expect(showError).toHaveBeenCalledTimes(1);
        expect(showError).toHaveBeenCalledWith(UNREACHED);
    });

    it("an action that throws before it awaits anything is caught too", async () => {
        const setBusy = vi.fn();
        const res = await runAction(
            () => {
                throw new Error("sync");
            },
            { setBusy },
        );
        expect(res).toBeUndefined();
        expect(setBusy).toHaveBeenLastCalledWith(false);
    });

    it("quiet hands the sentence to the caller instead of a toast", async () => {
        const said: string[] = [];
        await runAction(() => Promise.reject(new Error("offline")), {
            quiet: true,
            onUnreached: (sentence) => said.push(sentence),
        });
        expect(showError).not.toHaveBeenCalled();
        expect(said).toEqual([UNREACHED]);
    });

    it("one of Next's interrupts (a redirect after the save) goes on its way, busy cleared", async () => {
        const redirect = new Error("NEXT_REDIRECT");
        rethrow.mockImplementation((error: unknown) => {
            if (error === redirect) throw error;
        });
        const setBusy = vi.fn();
        await expect(
            runAction(() => Promise.reject(redirect), { setBusy }),
        ).rejects.toBe(redirect);
        expect(setBusy).toHaveBeenLastCalledWith(false);
        expect(showError).not.toHaveBeenCalled();
    });

    it("works with no options at all", async () => {
        expect(await runAction(() => Promise.resolve("done"))).toBe("done");
    });
});

/*
 * The scan. `setBusy(true); const res = await save(); setBusy(false);` is
 * the shape that stuck: nothing clears the control when the await throws.
 * Between a busy setter going on and coming off, every `await` must be one
 * that cannot throw: through `runAction`, with its own `.catch(`, or inside
 * a `try`.
 */
const APP = path.resolve(__dirname, "..", "..");
/** A setter that says something is under way: setBusy, setSaving, setPublishing… */
const BUSY = /Busy|Pending|[a-z]ing(?![a-z])/;
const ON = /^\s*(set[A-Z]\w*)\((true|[a-z][\w.]*|"[^"]*")\);\s*$/;

/** Awaited calls that catch for themselves, by the name they are called by. */
const CATCHES_ITSELF = [
    // `useSubscriptionActions`' own `run`: it catches and words the failure.
    "await run(",
    // Clipboard helpers answer false; they don't throw.
    "await copy(",
];

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            return name === "node_modules" || name.startsWith(".")
                ? []
                : sources(full);
        }
        return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
    });
}

function unguarded(): string[] {
    const found: string[] = [];
    for (const file of [
        ...sources(path.join(APP, "components")),
        ...sources(path.join(APP, "app")),
    ]) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            const m = ON.exec(line);
            const setter = m?.[1];
            if (!m || !setter || !BUSY.test(setter)) return;
            if (["false", "null", "undefined"].includes(m[2] ?? "")) return;
            const off = new RegExp(`\\b${setter}\\((false|null)\\)`);
            const end = lines
                .slice(i + 1, i + 80)
                .findIndex((l) => off.test(l));
            if (end === -1) return;
            const span = lines.slice(i + 1, i + 2 + end);
            if (span.some((l) => /\bfinally\b/.test(l))) return;
            let inTry = false;
            span.forEach((l, k) => {
                if (/\btry\s*\{/.test(l)) inTry = true;
                if (!/\bawait\b/.test(l) || inTry) return;
                // The awaited statement, to its end.
                const rest = span.slice(k, k + 14).join("\n");
                const statement = rest.slice(0, rest.indexOf(";") + 1 || 400);
                if (/await\s+runAction\(/.test(l)) return;
                if (/\(await\s+runAction\(/.test(l)) return;
                if (statement.includes(".catch(")) return;
                if (CATCHES_ITSELF.some((c) => l.includes(c))) return;
                // Awaits inside a runAction callback are its to catch.
                const before = span.slice(0, k).join("\n");
                const opened = before.lastIndexOf("runAction(");
                if (opened !== -1 && !before.slice(opened).includes(");")) {
                    return;
                }
                found.push(
                    `${path.relative(APP, file)}:${i + 2 + k} ${l.trim()}`,
                );
            });
        });
    }
    return found;
}

/*
 * The same for `startTransition(async () => { … })`. A server action that
 * throws inside one reaches the page's error boundary, which replaces the
 * form being typed with an error page.
 */
const TRANSITION =
    /^(\s*)(?:void )?(startTransition|start[A-Z]?\w*)\(async \(\) => \{\s*$/;

/** What runs in the browser and answers a word, not a server action. */
const NOT_AN_ACTION = [
    "await openRazorpayWindow(",
    "await confirmPaid(",
    "await confirm(",
    // A hold's `commit`: the hold catches a throw and words it as failed
    // (`lib/hold-undo.ts`).
    "reportCommit(await sendBatchNow(",
    ...CATCHES_ITSELF,
];

function unguardedTransitions(): string[] {
    const found: string[] = [];
    for (const file of [
        ...sources(path.join(APP, "components")),
        ...sources(path.join(APP, "app")),
    ]) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            const m = TRANSITION.exec(line);
            if (!m) return;
            const indent = m[1] ?? "";
            const end = lines
                .slice(i + 1, i + 240)
                .findIndex((l) => l.startsWith(`${indent}})`));
            if (end === -1) return;
            const block = lines.slice(i + 1, i + 1 + end);
            let inTry = false;
            block.forEach((l, k) => {
                if (/\btry\s*\{/.test(l)) inTry = true;
                if (!/\bawait\b/.test(l) || inTry) return;
                if (/\brunAction\(/.test(l)) return;
                if (NOT_AN_ACTION.some((c) => l.includes(c))) return;
                const rest = block.slice(k, k + 14).join("\n");
                const statement = rest.slice(0, rest.indexOf(";") + 1 || 400);
                if (statement.includes(".catch(")) return;
                const before = block.slice(0, k).join("\n");
                const opened = before.lastIndexOf("runAction(");
                if (opened !== -1 && !before.slice(opened).includes(");")) {
                    return;
                }
                found.push(
                    `${path.relative(APP, file)}:${i + 2 + k} ${l.trim()}`,
                );
            });
        });
    }
    return found;
}

describe("no control can be left busy by a thrown action", () => {
    it("every await inside a transition is one that can't throw, so no error page replaces a form", () => {
        expect(unguardedTransitions()).toEqual([]);
    });

    it("every await between a busy setter going on and off is one that can't throw", () => {
        expect(unguarded()).toEqual([]);
    });

    it("the scan sees the old shape (or it proves nothing)", () => {
        const stuck = [
            "        setBusy(true);",
            "        const res = await saveThing(id);",
            "        setBusy(false);",
        ];
        const m = ON.exec(stuck[0] ?? "");
        expect(m?.[1]).toBe("setBusy");
        expect(/await\s+runAction\(/.test(stuck[1] ?? "")).toBe(false);
    });
});
