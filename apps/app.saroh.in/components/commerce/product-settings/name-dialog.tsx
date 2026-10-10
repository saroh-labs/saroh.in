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
import type { ReactElement } from "react";
import { useId, useState } from "react";

/**
 * The one-field dialog Product settings adds and renames with: a new
 * category, a category's new name, a new allergen. The list behind it stays
 * as it was; the button that opens it is the dialog's trigger, so the
 * keyboard goes back there when it closes.
 *
 * Nothing is saved until the primary button. A name the tab's rule refuses
 * says why under the field; a refusal from the server keeps the dialog open
 * with what was typed. Cancel, Escape and the close button drop the draft,
 * and each opening starts from `initial`.
 */
export function NameDialog({
    trigger,
    title,
    note,
    label,
    placeholder,
    initial = "",
    submitLabel,
    busyLabel = "Saving…",
    problem,
    onSubmit,
}: {
    trigger: ReactElement;
    title: string;
    /** What the change does, said under the title. */
    note?: string;
    label: string;
    placeholder?: string;
    /** The saved name, when renaming. */
    initial?: string;
    submitLabel: string;
    busyLabel?: string;
    /** Why this name can't be saved, or "" when it can. */
    problem: (name: string) => string;
    /** Resolves true when it was saved. */
    onSubmit: (name: string) => Promise<boolean>;
}) {
    const fieldId = useId();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(initial);
    const [tried, setTried] = useState(false);
    const [busy, setBusy] = useState(false);
    const name = draft.trim();
    // An empty field says nothing until Save is pressed on it.
    const error = name || tried ? problem(name) : "";

    function save(e: React.FormEvent) {
        e.preventDefault();
        setTried(true);
        if (problem(name)) return;
        // Nothing to save: an unchanged name just closes.
        if (initial && name === initial) {
            setOpen(false);
            return;
        }
        setBusy(true);
        void onSubmit(name).then((ok) => {
            setBusy(false);
            if (ok) setOpen(false);
        });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (busy) return;
                if (o) {
                    setDraft(initial);
                    setTried(false);
                }
                setOpen(o);
            }}
        >
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent
                className="sm:max-w-[400px]"
                {...(note ? {} : { "aria-describedby": undefined })}
            >
                <form className="grid gap-4" noValidate onSubmit={save}>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        {note ? (
                            <DialogDescription>{note}</DialogDescription>
                        ) : null}
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label htmlFor={fieldId}>{label}</Label>
                        <Input
                            id={fieldId}
                            value={draft}
                            autoFocus
                            disabled={busy}
                            placeholder={placeholder}
                            aria-invalid={!!error}
                            aria-describedby={
                                error ? `${fieldId}-error` : undefined
                            }
                            onChange={(e) => setDraft(e.target.value)}
                        />
                        {error ? (
                            <p
                                id={`${fieldId}-error`}
                                role="alert"
                                className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                            >
                                {error}
                            </p>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy ? busyLabel : submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
