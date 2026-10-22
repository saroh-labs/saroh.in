/**
 * The editor's starter content (DEC-182): the copy runs only with nothing
 * unsaved, starts the editor afresh on the home page, and offers one Undo
 * that puts the draft back and starts it afresh again. "Bring in my
 * details", a roll back and a section brought in do the same (amended 22
 * Oct 2026).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { UNREACHED } from "@/lib/api/unreached";
import {
    STARTER_WAITS_FOR_SAVE,
    starterContentActions,
} from "./starter-content-actions";

const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const actions = vi.hoisted(() => ({
    copyStarterContent: vi.fn(),
    undoStarterContent: vi.fn(),
    fillDetails: vi.fn(),
    listDraftVersions: vi.fn(),
    rollbackDraft: vi.fn(),
    bringInSection: vi.fn(),
}));
vi.mock("@/lib/sites/actions", () => actions);

const COPIED = {
    snapshotId: "snap-1",
    templateId: "gym",
    look: "live",
    replaced: ["Home"],
    created: ["Classes"],
    filled: [],
};

function starter(unsaved = false) {
    const reloadDraft = vi.fn();
    const settleUndo = vi.fn();
    const s = starterContentActions({
        siteId: "site-1",
        homePageId: "p-home",
        unsaved,
        settleUndo,
        reloadDraft,
    });
    return { s, reloadDraft, settleUndo };
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("starterContentActions", () => {
    it("waits while the editor has unsaved work", () => {
        expect(starter(true).s.blocked).toBe(STARTER_WAITS_FOR_SAVE);
        expect(starter(false).s.blocked).toBeNull();
    });

    it("copies, opens the home page afresh and offers one Undo", async () => {
        actions.copyStarterContent.mockResolvedValue({
            ok: true,
            data: COPIED,
        });
        const { s, reloadDraft, settleUndo } = starter();

        await expect(s.copy("live", false)).resolves.toEqual({ ok: true });
        expect(settleUndo).toHaveBeenCalled();
        expect(actions.copyStarterContent).toHaveBeenCalledWith(
            "site-1",
            "live",
            false,
        );
        expect(reloadDraft).toHaveBeenCalledWith("p-home");
        expect(toast.dismissToasts).toHaveBeenCalled();
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Starter content added to your draft.",
            expect.any(Function),
            {
                description:
                    "Changed: Home and Classes. Replace the sample words with your own before you publish.",
            },
        );
    });

    it("sends Classic as classic", async () => {
        actions.copyStarterContent.mockResolvedValue({
            ok: true,
            data: COPIED,
        });
        await starter().s.copy(null, true);
        expect(actions.copyStarterContent).toHaveBeenCalledWith(
            "site-1",
            "classic",
            true,
        );
    });

    it("puts the draft back on Undo and starts the editor afresh", async () => {
        actions.copyStarterContent.mockResolvedValue({
            ok: true,
            data: COPIED,
        });
        actions.undoStarterContent.mockResolvedValue({
            ok: true,
            data: { restored: 1, removed: 1 },
        });
        const { s, reloadDraft } = starter();
        await s.copy("live", false);
        reloadDraft.mockClear();

        const undo = toast.showUndo.mock.calls[0]?.[1] as () => Promise<{
            ok: boolean;
        }>;
        await expect(undo()).resolves.toMatchObject({ ok: true });
        expect(actions.undoStarterContent).toHaveBeenCalledWith(
            "site-1",
            "snap-1",
        );
        expect(reloadDraft).toHaveBeenCalledWith();
    });

    it("hands a refused Undo's reason to the toast, leaving the editor as it is", async () => {
        actions.copyStarterContent.mockResolvedValue({
            ok: true,
            data: COPIED,
        });
        const refusal = {
            ok: false,
            error: "Your draft has changed since the starter content went in, so Undo would lose that work.",
            code: "STARTER_CHANGED",
        };
        actions.undoStarterContent.mockResolvedValue(refusal);
        const { s, reloadDraft } = starter();
        await s.copy("live", false);
        reloadDraft.mockClear();

        const undo = toast.showUndo.mock
            .calls[0]?.[1] as () => Promise<unknown>;
        await expect(undo()).resolves.toEqual(refusal);
        expect(reloadDraft).not.toHaveBeenCalled();
    });

    it("says a refusal back to the dialog, a plan's as paid, and changes nothing", async () => {
        actions.copyStarterContent.mockResolvedValue({
            ok: false,
            error: "Quiet comes with a paid plan.",
            plan: { moduleId: "themes" },
        });
        const { s, reloadDraft } = starter();
        await expect(s.copy("quiet", false)).resolves.toEqual({
            ok: false,
            error: "Quiet comes with a paid plan.",
            paid: true,
        });
        expect(reloadDraft).not.toHaveBeenCalled();
        expect(toast.showUndo).not.toHaveBeenCalled();
    });

    it("says an unreached copy in the dialog, not a toast", async () => {
        actions.copyStarterContent.mockRejectedValue(new Error("offline"));
        const { s, reloadDraft } = starter();
        await expect(s.copy("live", false)).resolves.toEqual({
            ok: false,
            error: UNREACHED,
        });
        expect(toast.showError).not.toHaveBeenCalled();
        expect(reloadDraft).not.toHaveBeenCalled();
    });

    it("says what Fill in my details filled in the copy's toast", async () => {
        actions.copyStarterContent.mockResolvedValue({
            ok: true,
            data: { ...COPIED, filled: ["team", "address"] },
        });
        await starter().s.copy("live", true);
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Starter content added to your draft.",
            expect.any(Function),
            {
                description:
                    "Changed: Home and Classes. Filled in your staff and address. Replace the sample words with your own before you publish.",
            },
        );
    });

    it("brings the details in with an Undo, and says when there is nothing to bring", async () => {
        actions.fillDetails.mockResolvedValueOnce({
            ok: true,
            data: { snapshotId: "snap-2", filled: ["team"], pages: ["Home"] },
        });
        const { s, reloadDraft, settleUndo } = starter();
        await s.fillDetails();
        expect(settleUndo).toHaveBeenCalled();
        expect(reloadDraft).toHaveBeenCalledWith(undefined);
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Brought in your staff.",
            expect.any(Function),
            { description: "Changed: Home." },
        );

        actions.fillDetails.mockResolvedValueOnce({
            ok: true,
            data: { snapshotId: null, filled: [], pages: [] },
        });
        reloadDraft.mockClear();
        await s.fillDetails();
        expect(reloadDraft).not.toHaveBeenCalled();
        expect(toast.showInfo).toHaveBeenCalledWith(
            "Nothing to bring in.",
            expect.stringContaining("Settings"),
        );
    });

    it("rolls back with its own Undo, and says a refusal back", async () => {
        actions.rollbackDraft.mockResolvedValueOnce({
            ok: true,
            data: { snapshotId: "snap-3", restored: 1 },
        });
        const { s, reloadDraft } = starter();
        await expect(s.rollback("v-1")).resolves.toEqual({ ok: true });
        expect(actions.rollbackDraft).toHaveBeenCalledWith("site-1", "v-1");
        expect(reloadDraft).toHaveBeenCalled();
        const undo = toast.showUndo.mock
            .calls[0]?.[1] as () => Promise<unknown>;
        actions.undoStarterContent.mockResolvedValue({ ok: true, data: {} });
        await undo();
        expect(actions.undoStarterContent).toHaveBeenCalledWith(
            "site-1",
            "snap-3",
        );

        actions.rollbackDraft.mockResolvedValueOnce({
            ok: false,
            error: "That version isn't here",
        });
        await expect(s.rollback("v-2")).resolves.toEqual({
            ok: false,
            error: "That version isn't here",
        });
    });

    it("brings a section in and opens its page", async () => {
        actions.bringInSection.mockResolvedValue({
            ok: true,
            data: { snapshotId: "snap-4", pageId: "p-about", title: "About" },
        });
        const { s, reloadDraft } = starter();
        await expect(s.bringIn("v-1", "p-about", "k-1")).resolves.toEqual({
            ok: true,
        });
        expect(actions.bringInSection).toHaveBeenCalledWith(
            "site-1",
            "v-1",
            "p-about",
            "k-1",
        );
        expect(reloadDraft).toHaveBeenCalledWith("p-about");
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Added to the end of About.",
        );
    });

    it("reads the previous versions, or says why not", async () => {
        actions.listDraftVersions.mockResolvedValueOnce({ ok: true, data: [] });
        await expect(starter().s.listVersions()).resolves.toEqual({
            ok: true,
            versions: [],
        });
        actions.listDraftVersions.mockRejectedValueOnce(new Error("offline"));
        await expect(starter().s.listVersions()).resolves.toEqual({
            ok: false,
            error: UNREACHED,
        });
    });
});
