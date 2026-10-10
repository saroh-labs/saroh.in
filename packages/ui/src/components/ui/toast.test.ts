import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    NOT_UNDONE,
    settleUndo,
    showSuccess,
    showUndo,
    UNDO_MS,
    UNDONE,
} from "./toast";

const { toast } = vi.hoisted(() => ({
    toast: Object.assign(vi.fn(), {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        message: vi.fn(),
        dismiss: vi.fn(),
    }),
}));
vi.mock("sonner", () => ({ toast }));

/** Press the Undo on the toast `showUndo` just drew. */
async function pressUndo() {
    const options = toast.mock.calls.at(-1)?.[1] as {
        action: { label: string; onClick: () => void };
    };
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
    toast.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("showUndo", () => {
    it("lasts ten seconds, everywhere", () => {
        expect(UNDO_MS).toBe(10_000);
        showUndo("Note deleted.", () => Promise.resolve(true));
        expect(toast.mock.calls[0]?.[0]).toBe("Note deleted.");
        expect(toast.mock.calls[0]?.[1]).toMatchObject({ duration: 10_000 });
    });

    it("says Undone. when the undo worked", async () => {
        const undo = vi.fn(() => Promise.resolve({ ok: true }));
        showUndo("Note deleted.", undo);
        await pressUndo();
        expect(undo).toHaveBeenCalledTimes(1);
        expect(toast.success).toHaveBeenCalledWith(UNDONE, {
            description: undefined,
        });
        expect(UNDONE).toBe("Undone.");
    });

    it("says it couldn't, with the reason, when the undo was refused", async () => {
        showUndo("Note deleted.", () =>
            Promise.resolve({ ok: false, error: "It was changed since." }),
        );
        await pressUndo();
        expect(toast.error).toHaveBeenCalledWith(
            NOT_UNDONE,
            expect.objectContaining({ description: "It was changed since." }),
        );
        expect(NOT_UNDONE).toBe("Couldn't undo. It stays as saved.");
        expect(toast.success).not.toHaveBeenCalled();
    });

    it.each([
        ["resolved false", () => Promise.resolve(false)],
        ["threw", () => Promise.reject(new Error("offline"))],
    ])("never fails silently: it %s", async (_how, undo) => {
        showUndo("Note deleted.", undo);
        await pressUndo();
        expect(toast.error).toHaveBeenCalledWith(NOT_UNDONE, expect.anything());
    });

    it("leaves the words to a caller that draws the outcome itself", async () => {
        const undo = vi.fn(() => undefined);
        showUndo("Marked sent.", undo);
        await pressUndo();
        expect(undo).toHaveBeenCalledTimes(1);
        expect(toast.success).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();

        expect(await settleUndo(() => Promise.resolve(true), true)).toBe(true);
        expect(toast.success).not.toHaveBeenCalled();
    });
});

describe("showSuccess", () => {
    it("can carry the way to the thing just made", () => {
        const go = vi.fn();
        showSuccess("Lead added.", "Weekend classes", {
            label: "Open lead",
            onClick: go,
        });
        const options = toast.success.mock.calls[0]?.[1] as {
            description: string;
            action: { label: string; onClick: () => void };
        };
        expect(options.description).toBe("Weekend classes");
        expect(options.action.label).toBe("Open lead");
        options.action.onClick();
        expect(go).toHaveBeenCalledTimes(1);
    });

    it("is a plain line without one", () => {
        showSuccess("Note added.");
        expect(toast.success).toHaveBeenCalledWith("Note added.", {
            description: undefined,
        });
    });
});
