// @vitest-environment jsdom
/**
 * Hours saved as you go, under quick changes: a read that lands while
 * saves are queued doesn't draw an older week, the page is read again once
 * the queue empties, a refusal puts back what the server last accepted
 * and drops what was built on it, and Undo waits its turn.
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffView, WeeklyRange } from "@/lib/staff/types";

import { useHours } from "./use-hours";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const showUndo = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...a: unknown[]) => showUndo(...a) as unknown,
    showError: (...a: unknown[]) => showError(...a) as unknown,
    dismissToast: vi.fn(),
}));
const replaceStaffHours = vi.fn();
vi.mock("@/lib/staff/actions", () => ({
    replaceStaffHours: (...a: unknown[]) => replaceStaffHours(...a) as unknown,
}));

const day = (d: number): WeeklyRange => ({
    dayOfWeek: d,
    startMinute: 540,
    endMinute: 1020,
});
const MON = day(1);
const TUE = day(2);
const WED = day(3);
const meera = (hours: WeeklyRange[]) =>
    ({ id: "m", name: "Meera", hours }) as unknown as StaffView;

type Api = ReturnType<typeof useHours>;
const seen: { api: Api | null } = { api: null };
const api = () => {
    if (!seen.api) throw new Error("Not rendered");
    return seen.api;
};
function Probe({ staff }: { staff: StaffView[] }) {
    const hours = useHours(staff);
    useEffect(() => {
        seen.api = hours;
    });
    return null;
}

let root: Root;
const draw = (staff: StaffView[]) =>
    act(() => root.render(<Probe staff={staff} />));
const days = () =>
    api()
        .weeks.m.map((h) => h.dayOfWeek)
        .sort();
const WORDS = { done: "Saved.", failed: "Couldn't save." };

/** A save the test answers by hand. */
function deferred() {
    const calls: ((v: unknown) => void)[] = [];
    replaceStaffHours.mockImplementation(
        () =>
            new Promise((r) => {
                calls.push(r);
            }),
    );
    return {
        answer: async (i: number, v: unknown) => {
            await act(async () => {
                await new Promise((r) => setTimeout(r, 0));
                const call = calls.at(i);
                if (!call) throw new Error(`No save ${i} on its way`);
                call(v);
                await new Promise((r) => setTimeout(r, 0));
            });
        },
    };
}
const ok = (hours: WeeklyRange[]) => ({
    ok: true,
    data: { staff: meera(hours), outside: [] },
});

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    for (const m of [refresh, showUndo, showError, replaceStaffHours])
        m.mockReset();
    root = createRoot(document.createElement("div"));
});
afterEach(() => {
    act(() => root.unmount());
});

describe("useHours", () => {
    it("keeps the queued change on screen when an older read lands, and reads again once", async () => {
        const answers = deferred();
        draw([meera([MON])]);
        act(() => void api().save("m", [MON, TUE], WORDS));
        act(() => void api().save("m", [MON, TUE, WED], WORDS));
        await answers.answer(0, ok([MON, TUE]));
        // The page's read from before the second save arrives.
        draw([meera([MON, TUE])]);
        expect(days()).toEqual([1, 2, 3]);
        expect(refresh).not.toHaveBeenCalled();
        await answers.answer(1, ok([MON, TUE, WED]));
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(days()).toEqual([1, 2, 3]);
    });

    it("a refusal puts back what the server last accepted, and drops what was built on it", async () => {
        const answers = deferred();
        draw([meera([MON])]);
        act(() => void api().save("m", [MON, TUE], WORDS));
        act(() => void api().save("m", [MON, TUE, WED], WORDS));
        await answers.answer(0, { ok: false, error: "Not allowed." });
        expect(showError).toHaveBeenCalledWith(
            "Couldn't save.",
            "Not allowed.",
        );
        expect(days()).toEqual([1]);
        expect(replaceStaffHours).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("Undo waits for a save on its way, then puts back the week before its change", async () => {
        const answers = deferred();
        draw([meera([MON])]);
        act(() => void api().save("m", [MON, TUE], WORDS));
        await answers.answer(0, ok([MON, TUE]));
        const undo = showUndo.mock.calls[0]?.[1] as () => Promise<unknown>;
        // A later change, on its way, then Undo of the first.
        act(() => void api().save("m", [MON, TUE, WED], WORDS));
        let undone: Promise<unknown> = Promise.resolve();
        act(() => {
            undone = undo();
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(replaceStaffHours).toHaveBeenCalledTimes(2);
        await answers.answer(1, ok([MON, TUE, WED]));
        expect(replaceStaffHours).toHaveBeenCalledTimes(3);
        expect(replaceStaffHours.mock.calls[2]?.[1]).toEqual([MON]);
        await answers.answer(2, ok([MON]));
        await act(async () => {
            await undone;
        });
        expect(days()).toEqual([1]);
    });
});
