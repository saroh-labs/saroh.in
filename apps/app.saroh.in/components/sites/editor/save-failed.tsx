"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { RotateCw } from "lucide-react";

import type { EditorDraft } from "./use-editor-draft";

/** `fix/WXKStates`, `fix/WXNStates` "Couldn't save": same words desk and phone. */
export const COULDNT_SAVE = "Couldn't save.";
export const WORDS_KEPT =
    "Your words are kept here. Check your connection, then try again.";

/**
 * C12: the revision 409 said with who and what, never as live presence.
 * The owner's own save from another tab is theirs, never "someone else's"
 * (editor audit, 21 Nov).
 */
export function changedSinceLine(
    by: string | null,
    page: string,
    you = false,
): string {
    if (you) return `You changed ${page} in another tab or window.`;
    return `${by ?? "Someone else"} changed ${page} since you opened it.`;
}

/**
 * The page's save failed for a reason that isn't the words (the connection,
 * an outage): they stay on screen, and Try again sends the same save now.
 * A section the API refused says why by its field instead, and a conflict
 * has its own notice, so neither shows this.
 */
export function SaveFailedNotice({
    draft,
    className,
}: {
    draft: Pick<
        EditorDraft,
        "saveError" | "conflict" | "errorIndex" | "saving" | "retry"
    >;
    className?: string;
}) {
    if (!draft.saveError || draft.conflict || draft.errorIndex !== null) {
        return null;
    }
    return (
        <Notice
            tone="error"
            title={COULDNT_SAVE}
            className={className}
            data-save-failed=""
            action={
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    busy={draft.saving}
                    busyLabel="Saving…"
                    onClick={() => void draft.retry()}
                >
                    <RotateCw aria-hidden className="size-4" />
                    Try again
                </Button>
            }
        >
            {WORDS_KEPT}
        </Notice>
    );
}
