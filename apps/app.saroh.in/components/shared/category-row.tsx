"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * One category in a list you manage: its name, a line about it, and the two
 * things done to it — rename, and delete.
 *
 * The row is always read: Rename opens a small dialog with the one field
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
    renameNote?: string;
    deleteTitle: string;
    deleteBody: string;
    /** Resolves true when the new name was saved. */
    onRename: (name: string) => Promise<boolean>;
    onDelete: () => Promise<void>;
}) {
    const fieldId = useId();
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(name);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);

    function save(e: React.FormEvent) {
        e.preventDefault();
        // Nothing to save: an empty or unchanged name just closes.
        if (!draft.trim() || draft.trim() === name) {
            setRenaming(false);
            return;
        }
        setBusy(true);
        // A refusal keeps the dialog open with what was typed.
        void onRename(draft.trim()).then((ok) => {
            setBusy(false);
            if (ok) setRenaming(false);
        });
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
                <Dialog
                    open={renaming}
                    onOpenChange={(o) => {
                        if (busy) return;
                        if (o) setDraft(name);
                        setRenaming(o);
                    }}
                >
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Rename ${name}`}
                        >
                            Rename
                        </Button>
                    </DialogTrigger>
                    <DialogContent
                        className="sm:max-w-[400px]"
                        {...(renameNote
                            ? {}
                            : { "aria-describedby": undefined })}
                    >
                        <form className="grid gap-4" onSubmit={save}>
                            <DialogHeader>
                                <DialogTitle>Rename category</DialogTitle>
                                {renameNote ? (
                                    <DialogDescription>
                                        {renameNote}
                                    </DialogDescription>
                                ) : null}
                            </DialogHeader>
                            <div className="grid gap-1.5">
                                <Label htmlFor={fieldId}>Name</Label>
                                <Input
                                    id={fieldId}
                                    value={draft}
                                    autoFocus
                                    disabled={busy}
                                    onChange={(e) => setDraft(e.target.value)}
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setRenaming(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={busy}>
                                    {busy ? "Saving…" : "Save"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
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
