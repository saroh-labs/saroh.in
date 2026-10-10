"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
    ACTION_SHEET_BODY,
    ACTION_SHEET_FORM,
    ActionSheetFooter,
} from "@/components/shared/action-sheet";
import { logActivity } from "@/lib/leads/actions";

/**
 * Note composer for a lead (S3-007), drawn inside the lead's "Add note"
 * sheet. Writes a free-text NOTE onto the lead's timeline via the
 * `logActivity` server action (`activity:write`), then closes the sheet
 * (`onDone`) and refreshes the server-rendered view so the note appears at
 * the top of the timeline. A refusal is a toast and the sheet stays open
 * with what was typed. Owner/Admin-only writes are enforced by the api.
 */
export function ActivityComposer({
    leadId,
    onDone,
    onDirtyChange,
}: {
    leadId: string;
    /** The note was saved: close the sheet. */
    onDone: () => void;
    /** Something is typed, so a stray press outside must not close it. */
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);
    const id = useId();

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (!text) return;
        setBusy(true);
        const res = await logActivity(leadId, text);
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Note added");
        onDone();
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className={ACTION_SHEET_FORM}>
            <div className={ACTION_SHEET_BODY}>
                <div className="grid gap-2">
                    <Label htmlFor={id}>Note</Label>
                    <Textarea
                        id={id}
                        placeholder="Log a note or call summary…"
                        value={body}
                        disabled={busy}
                        onChange={(e) => {
                            setBody(e.target.value);
                            onDirtyChange?.(e.target.value.trim() !== "");
                        }}
                        rows={6}
                    />
                </div>
            </div>
            <ActionSheetFooter busy={busy}>
                <Button
                    type="submit"
                    className="wk-press"
                    disabled={busy || !body.trim()}
                >
                    {busy ? "Saving…" : "Add note"}
                </Button>
            </ActionSheetFooter>
        </form>
    );
}
