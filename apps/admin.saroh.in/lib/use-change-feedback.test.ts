/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    AUDITED,
    HIGHLIGHT_MS,
    UNDO_FAILED,
    UNDO_FAILED_DETAIL,
    UNDO_MS,
    UNDONE,
    UNDONE_DETAIL,
    useChangeFeedback,
} from "./use-change-feedback";

const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

beforeEach(() => {
    for (const fn of Object.values(toast)) fn.mockReset();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/** Press the Undo on the last Undo toast. */
function pressUndo() {
    const onUndo = toast.showUndo.mock.calls.at(-1)?.[1] as () => void;
    act(() => onUndo());
}

describe("useChangeFeedback", () => {
    it("shows the write's message and highlights its row for two seconds", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useChangeFeedback());
        act(() =>
            result.current.report({
                message: "Rye & Co. suspended.",
                rowId: "o1",
            }),
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Rye & Co. suspended.",
            AUDITED,
        );
        expect(result.current.isHighlighted("o1")).toBe(true);
        expect(result.current.isHighlighted("o2")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(HIGHLIGHT_MS - 1);
        });
        expect(result.current.isHighlighted("o1")).toBe(true);
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.isHighlighted("o1")).toBe(false);
    });

    it("offers no Undo without an inverse", () => {
        const { result } = renderHook(() => useChangeFeedback());
        act(() => result.current.report({ message: "Invite sent." }));
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(toast.dismissToasts).not.toHaveBeenCalled();
        expect(toast.showSuccess).toHaveBeenCalledTimes(1);
    });

    it("offers Undo for the console's length, calls the inverse and says it was undone", async () => {
        const undo = vi.fn().mockResolvedValue({ ok: true });
        const { result } = renderHook(() => useChangeFeedback());
        act(() =>
            result.current.report({
                message: "Payments is on for Org 2",
                undo,
                rowId: "o2",
            }),
        );
        expect(toast.dismissToasts).toHaveBeenCalled();
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Payments is on for Org 2",
            expect.any(Function),
            { duration: UNDO_MS, description: AUDITED },
        );
        expect(toast.showSuccess).not.toHaveBeenCalled();

        pressUndo();
        expect(undo).toHaveBeenCalledTimes(1);
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                UNDONE,
                UNDONE_DETAIL,
            ),
        );
        expect(result.current.isHighlighted("o2")).toBe(true);
    });

    it("says an Undo that was refused didn't finish, in the screen's words", async () => {
        const undo = vi.fn().mockResolvedValue({
            ok: false,
            description: "Still changed for Org 3.",
        });
        const { result } = renderHook(() => useChangeFeedback());
        act(() => result.current.report({ message: "Payments is on", undo }));
        pressUndo();
        await waitFor(() =>
            expect(toast.showError).toHaveBeenCalledWith(
                UNDO_FAILED,
                "Still changed for Org 3.",
            ),
        );
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("says an Undo that threw didn't finish", async () => {
        const undo = vi.fn().mockRejectedValue(new Error("network"));
        const { result } = renderHook(() => useChangeFeedback());
        act(() => result.current.report({ message: "Payments is on", undo }));
        pressUndo();
        await waitFor(() =>
            expect(toast.showError).toHaveBeenCalledWith(
                UNDO_FAILED,
                UNDO_FAILED_DETAIL,
            ),
        );
    });

    it("keeps a changed row the filter would hide, highlighted, until the filter changes", () => {
        vi.useFakeTimers();
        interface Org {
            id: string;
            status: "active" | "suspended";
        }
        const before: Org[] = [
            { id: "o1", status: "active" },
            { id: "o2", status: "active" },
        ];
        // o1 was just suspended: the "Active" filter would now hide it.
        const after: Org[] = [
            { id: "o1", status: "suspended" },
            { id: "o2", status: "active" },
        ];
        const options = {
            id: (o: Org) => o.id,
            passes: (o: Org) => o.status === "active",
        };
        const { result, rerender } = renderHook(
            ({ filterKey }) => useChangeFeedback({ filterKey }),
            { initialProps: { filterKey: "active" } },
        );
        expect(result.current.keep(before, options).rows).toHaveLength(2);

        act(() =>
            result.current.report({ message: "Org 1 suspended.", rowId: "o1" }),
        );
        act(() => {
            vi.advanceTimersByTime(HIGHLIGHT_MS * 5);
        });

        const held = result.current.keep(after, options);
        expect(held.rows.map((o) => o.id)).toEqual(["o1", "o2"]);
        expect(held.highlighted("o1")).toBe(true);
        expect(held.highlighted("o2")).toBe(false);

        rerender({ filterKey: "active|q=org" });
        const next = result.current.keep(after, options);
        expect(next.rows.map((o) => o.id)).toEqual(["o2"]);
        expect(next.highlighted("o1")).toBe(false);
    });

    it("lets a refresh let go of the rows it kept", () => {
        const { result } = renderHook(() => useChangeFeedback());
        act(() =>
            result.current.report({ message: "Org 1 suspended.", rowId: "o1" }),
        );
        const rows = [{ id: "o1" }];
        const options = {
            id: (o: { id: string }) => o.id,
            passes: () => false,
        };
        expect(result.current.keep(rows, options).rows).toHaveLength(1);
        act(() => result.current.clearKept());
        expect(result.current.keep(rows, options).rows).toHaveLength(0);
    });
});
