"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { createComment } from "@/lib/sites/actions";

/**
 * Leave a note on the selected section (#277).
 *
 * The API has taken notes since #193 and nothing in the app ever posted one,
 * while the Review tab's empty state told merchants that "anyone with the
 * Reviewer role can pin notes to sections from this editor". This is that
 * control.
 *
 * It sits under the section's own header in the field panel, because a note is
 * about the section you are looking at — the same place the design puts it, and
 * the reason the composer needs no section picker.
 */
export function NoteComposer({
    sectionKey,
    ...props
}: {
    siteId: string;
    pageId: string;
    /**
     * Undefined only for a section from before #277, when the server minted
     * keys and the editor never learned them until a reload.
     */
    sectionKey: string | undefined;
    onAdded: () => void;
}) {
    if (sectionKey === undefined) {
        return (
            <p className="text-xs text-muted-foreground">
                Save this section before leaving a note on it.
            </p>
        );
    }
    return <Composer {...props} sectionKey={sectionKey} />;
}

function Composer({
    siteId,
    pageId,
    sectionKey,
    onAdded,
}: {
    siteId: string;
    pageId: string;
    sectionKey: string;
    onAdded: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [body, setBody] = useState("");
    const [saving, setSaving] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (text.length === 0) return;
        setSaving(true);
        const res = await createComment(siteId, {
            pageId,
            sectionKey,
            body: text,
        });
        setSaving(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setBody("");
        setOpen(false);
        showSuccess("Note added. It is in the Review tab.");
        onAdded();
    }

    if (!open) {
        return (
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setOpen(true)}
            >
                Leave a note
            </Button>
        );
    }

    return (
        <form onSubmit={submit} className="grid gap-2">
            <label htmlFor="note-body" className="text-xs font-medium">
                Your note about this section
            </label>
            <textarea
                id="note-body"
                autoFocus
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={saving}
                placeholder="What should change here?"
                className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
            <div className="flex gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={saving || body.trim().length === 0}
                >
                    {saving ? "Adding…" : "Add note"}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                        setOpen(false);
                        setBody("");
                    }}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}
