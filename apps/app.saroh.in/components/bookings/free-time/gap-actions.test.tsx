// @vitest-environment jsdom
/**
 * The free-time sheet's writes and reads: Block this time's Undo takes
 * away the time off it added (never an older one at the same minute), and
 * a failed availability read leaves a service offered, not "can't start".
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Service } from "@/lib/services/service";
import type { StaffView, TimeOff } from "@/lib/staff/types";

import type { GapStarts } from "./gap-actions";
import { blockGapTime, useGapStarts } from "./gap-actions";
import type { GapTarget } from "./gap-types";

const showUndo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...args: unknown[]) => showUndo(...args) as unknown,
    showError: vi.fn(),
}));
const addTimeOff = vi.fn();
const removeTimeOff = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ ok: true }),
);
vi.mock("@/lib/staff/actions", () => ({
    addTimeOff: (...args: unknown[]) => addTimeOff(...args) as unknown,
    removeTimeOff: (...args: unknown[]) => removeTimeOff(...args) as unknown,
    addExtraHours: vi.fn(),
    removeExtraHours: vi.fn(),
}));
const listAvailability = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    listAvailability: (...args: unknown[]) =>
        listAvailability(...args) as unknown,
}));

const IST = "Asia/Kolkata";
const DAY = "2026-10-20";
const off = (id: string, startAt: string): TimeOff => ({
    id,
    startAt,
    endAt: startAt,
    allDay: false,
    reason: null,
});
// 10:00 in India.
const TEN = "2026-10-20T04:30:00.000Z";

const asha = (timeOff: TimeOff[]) =>
    ({
        id: "asha",
        name: "Asha Rao",
        serviceIds: ["svc"],
        hours: [],
        extraHours: [],
        timeOff,
    }) as unknown as StaffView;

beforeEach(() => {
    showUndo.mockReset();
    addTimeOff.mockReset();
    removeTimeOff.mockClear();
    listAvailability.mockReset();
});

describe("Block this time", () => {
    it("Undo removes the time off it added, not an older one at the same start", async () => {
        const older = off("older", TEN);
        addTimeOff.mockResolvedValue({
            ok: true,
            data: { staff: { timeOff: [older, off("new", TEN)] } },
        });
        await blockGapTime(
            {
                target: {
                    staff: asha([older]),
                    date: DAY,
                    free: [600, 660],
                },
                minutes: 30,
                timezone: IST,
                setBusy: () => undefined,
            },
            { onClose: () => undefined, refresh: () => undefined },
        );
        const undo = showUndo.mock.calls[0]?.[1] as () => Promise<unknown>;
        await undo();
        expect(removeTimeOff).toHaveBeenCalledWith("asha", "new");
    });
});

describe("useGapStarts", () => {
    let root: Root;
    const seen: { starts: GapStarts | null } = { starts: null };
    function Probe({
        target,
        offered,
    }: {
        target: GapTarget;
        offered: Service[];
    }) {
        const starts = useGapStarts(offered, target, IST);
        useEffect(() => {
            seen.starts = starts;
        });
        return null;
    }

    beforeEach(() => {
        (
            globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
        ).IS_REACT_ACT_ENVIRONMENT = true;
        seen.starts = null;
        root = createRoot(document.createElement("div"));
    });
    afterEach(() => {
        act(() => root.unmount());
    });

    it("a failed read is not known, not 'can't start here'", async () => {
        listAvailability.mockRejectedValue(new Error("offline"));
        const target: GapTarget = {
            staff: asha([]),
            date: DAY,
            free: [600, 660],
        };
        const offered = [
            { id: "svc", durationMinutes: 30 } as unknown as Service,
        ];
        await act(async () => {
            root.render(<Probe target={target} offered={offered} />);
            await Promise.resolve();
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(seen.starts).not.toBeNull();
        expect("svc" in (seen.starts ?? {})).toBe(true);
        expect(seen.starts?.svc).toBeUndefined();
    });
});
