"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import type { ConfirmResult } from "@/components/shared/confirm/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { NameDialog } from "@/components/shared/forms/name-dialog";

/**
 * One category in a list you manage: its name, a line about it, and the two
 * things done to it — rename, and delete.
 *
 * The row is always read: Rename opens the one-field dialog (`NameDialog`)
 * rather than turning the row into a form, so the list never changes shape
 * under the person reading it.
 *
 * Deleting asks first. The API moves everything in the category to
 * Uncategorized and then removes it, so re-creating it afterwards would not
 * put anything back — undo is impossible, and by the design's rule that is
 * exactly when a confirm is right.
 */
export function CategoryRow({
    name,
    meta,
    renameNote,
    deleteTitle,
    deleteBody,
    onRename,
    onDelete,
}: {
    name: string;
    meta?: string;
    /** What a rename leaves alone, said under the dialog's title. */
    renameNote: string;
    deleteTitle: string;
    deleteBody: string;
    /** Resolves true when the new name was saved. */
    onRename: (name: string) => Promise<boolean>;
    /** Waited for by the confirm; a refusal stays in it. */
    onDelete: () => Promise<ConfirmResult>;
}) {
    const [confirming, setConfirming] = useState(false);

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
                <NameDialog
                    trigger={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Rename ${name}`}
                        >
                            Rename
                        </Button>
                    }
                    title="Rename category"
                    note={renameNote}
                    label="Name"
                    initial={name}
                    submitLabel="Save"
                    problem={(next) => (next ? "" : "A category needs a name.")}
                    onSubmit={onRename}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${name}`}
                    className="text-destructive hover:text-destructive"
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
                keepLabel="Keep category"
                onConfirm={onDelete}
            />
        </div>
    );
}
