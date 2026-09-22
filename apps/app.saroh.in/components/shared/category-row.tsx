"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * One category in a list you manage: its name, a line about it, and the two
 * things done to it — rename in place, and delete.
 *
 * Deleting asks first. The API moves everything in the category to
 * Uncategorized and then removes it, so re-creating it afterwards would not
 * put anything back — undo is impossible, and by the design's rule that is
 * exactly when a confirm is right.
 */
export function CategoryRow({
    name,
    meta,
    deleteTitle,
    deleteBody,
    onRename,
    onDelete,
}: {
    name: string;
    meta?: string;
    deleteTitle: string;
    deleteBody: string;
    /** Resolves true when the new name was saved. */
    onRename: (name: string) => Promise<boolean>;
    onDelete: () => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);

    if (editing) {
        return (
            <form
                className="flex flex-wrap items-center gap-2 p-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!draft.trim() || draft.trim() === name) {
                        setEditing(false);
                        return;
                    }
                    setBusy(true);
                    void onRename(draft.trim()).then((ok) => {
                        setBusy(false);
                        if (ok) setEditing(false);
                    });
                }}
            >
                <Input
                    aria-label={`New name for ${name}`}
                    value={draft}
                    autoFocus
                    className="h-8 min-w-[160px] flex-1"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(false);
                    }}
                />
                <Button type="submit" size="sm" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                >
                    Cancel
                </Button>
            </form>
        );
    }

    return (
        <div className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                {meta ? (
                    <p className="truncate text-xs text-muted-foreground">
                        {meta}
                    </p>
                ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Rename ${name}`}
                    onClick={() => {
                        setDraft(name);
                        setEditing(true);
                    }}
                >
                    Rename
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${name}`}
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                >
                    Delete
                </Button>
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={deleteTitle}
                description={deleteBody}
                confirmLabel="Delete category"
                onConfirm={() => {
                    setBusy(true);
                    void onDelete().finally(() => setBusy(false));
                }}
            />
        </div>
    );
}
