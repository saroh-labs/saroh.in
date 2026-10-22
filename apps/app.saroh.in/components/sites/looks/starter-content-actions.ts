import type { LookId } from "@saroh/block-contract";
import { dismissToasts, showInfo, showUndo } from "@saroh/ui/toast";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import {
    bringInSection,
    copyStarterContent,
    fillDetails,
    listDraftVersions,
    rollbackDraft,
    undoStarterContent,
} from "@/lib/sites/actions";
import type { DraftVersion } from "@/lib/sites/service";
import {
    broughtInMessage,
    fillDoneMessage,
    ROLLBACK_DONE,
    starterDoneMessage,
} from "@/lib/sites/starter-content";

/** How a change to the draft went, for the dialog or sheet to say. */
export type StarterCopyOutcome =
    | { ok: true }
    /** `paid`: the plan refused the look, said as the row says it. */
    | { ok: false; error: string; paid?: boolean };

/** The draft's previous versions, or why they couldn't be read. */
export type VersionsRead =
    { ok: true; versions: DraftVersion[] } | { ok: false; error: string };

/**
 * What the editor offers beside the looks (DEC-182): a look's starter
 * content, "Bring in my details", and the draft's previous versions.
 */
export interface StarterContentActions {
    /**
     * Why the draft can't be changed now (the editor has changes not saved
     * yet); null when it can.
     */
    blocked: string | null;
    /**
     * Copy the look's showcase template into the draft, the business's
     * details in place of the samples when `fill`.
     */
    copy: (look: LookId | null, fill: boolean) => Promise<StarterCopyOutcome>;
    /** "Bring in my details": said in a toast, with Undo when it changed. */
    fillDetails: () => Promise<void>;
    /** The draft's previous versions, newest first. */
    listVersions: () => Promise<VersionsRead>;
    /** Roll the draft back to a previous version. */
    rollback: (versionId: string) => Promise<StarterCopyOutcome>;
    /** One section of a previous version brought into the draft. */
    bringIn: (
        versionId: string,
        pageId: string,
        sectionKey: string,
    ) => Promise<StarterCopyOutcome>;
}

export const STARTER_WAITS_FOR_SAVE =
    "Your last changes aren't saved yet. Once they are, you can use the starter content.";

/**
 * The starter content, "Bring in my details" and previous versions from
 * the editor (DEC-182). Each changes the draft on the server, so the
 * editor is started afresh on the new draft and a toast offers Undo for
 * ten seconds; Undo puts the previous draft back and starts the editor
 * afresh again.
 *
 * Each waits while the editor has unsaved work: the change would replace
 * the draft under it. The editor's own Undo is settled first, since the
 * change replaces what it would take back.
 */
export function starterContentActions({
    siteId,
    homePageId,
    unsaved,
    settleUndo,
    reloadDraft,
}: {
    siteId: string;
    homePageId: string | null;
    unsaved: boolean;
    settleUndo: () => void;
    reloadDraft: (pageId?: string) => void;
}): StarterContentActions {
    /** The editor afresh on `pageId`, and the one Undo on screen. */
    const changed = (
        snapshotId: string,
        message: string,
        description: string | undefined,
        pageId?: string,
    ) => {
        reloadDraft(pageId);
        // One Undo on screen: the editor's older ones are for a draft that
        // is gone.
        dismissToasts();
        showUndo(
            message,
            async () => {
                const undone = await undoStarterContent(siteId, snapshotId);
                if (undone.ok) reloadDraft();
                return undone;
            },
            { description },
        );
    };

    const copy = async (
        look: LookId | null,
        fill: boolean,
    ): Promise<StarterCopyOutcome> => {
        settleUndo();
        // Unreached, it is said in the dialog rather than a toast.
        const res = await runAction(
            () => copyStarterContent(siteId, look ?? "classic", fill),
            { quiet: true },
        );
        if (!res) return { ok: false, error: UNREACHED };
        if (!res.ok) {
            return {
                ok: false,
                error: res.error,
                ...(res.plan ? { paid: true } : {}),
            };
        }
        const { message, description } = starterDoneMessage(res.data);
        changed(
            res.data.snapshotId,
            message,
            description,
            homePageId ?? undefined,
        );
        return { ok: true };
    };

    const fillDetailsNow = async () => {
        settleUndo();
        const res = await runAction(() => fillDetails(siteId));
        if (!res) return;
        if (!res.ok) {
            showInfo(res.error);
            return;
        }
        const { message, description } = fillDoneMessage(res.data);
        if (res.data.snapshotId === null) {
            showInfo(message, description);
            return;
        }
        changed(res.data.snapshotId, message, description);
    };

    const listVersions = async (): Promise<VersionsRead> => {
        const res = await runAction(() => listDraftVersions(siteId), {
            quiet: true,
        });
        if (!res) return { ok: false, error: UNREACHED };
        return res.ok
            ? { ok: true, versions: res.data }
            : { ok: false, error: res.error };
    };

    const rollback = async (versionId: string): Promise<StarterCopyOutcome> => {
        settleUndo();
        const res = await runAction(() => rollbackDraft(siteId, versionId), {
            quiet: true,
        });
        if (!res) return { ok: false, error: UNREACHED };
        if (!res.ok) return { ok: false, error: res.error };
        changed(res.data.snapshotId, ROLLBACK_DONE, undefined);
        return { ok: true };
    };

    const bringIn = async (
        versionId: string,
        pageId: string,
        sectionKey: string,
    ): Promise<StarterCopyOutcome> => {
        settleUndo();
        const res = await runAction(
            () => bringInSection(siteId, versionId, pageId, sectionKey),
            { quiet: true },
        );
        if (!res) return { ok: false, error: UNREACHED };
        if (!res.ok) return { ok: false, error: res.error };
        changed(
            res.data.snapshotId,
            broughtInMessage(res.data.title),
            undefined,
            res.data.pageId,
        );
        return { ok: true };
    };

    return {
        blocked: unsaved ? STARTER_WAITS_FOR_SAVE : null,
        copy,
        fillDetails: fillDetailsNow,
        listVersions,
        rollback,
        bringIn,
    };
}
