"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { FormDialog } from "./form-dialog";

/**
 * The one-field dialog a list you manage adds and renames with: a new
 * category, a category's new name, a new allergen. `FormDialog` with one
 * field. The list behind it stays as it was; the button that opens it is
 * the dialog's trigger, so the keyboard goes back there when it closes.
 *
 * Nothing is saved until the dialog's button. A name the list's rule
 * refuses says why under the field once the button is pressed, and stops
 * saying it as soon as the name is fixed. A refusal from the server keeps
 * the dialog open with what was typed. A rename left as it was just
 * closes. Each opening starts from `initial`.
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
    note: string;
    label: string;
    placeholder?: string;
    /** The saved name, when renaming. */
    initial?: string;
    /** "Save" for a rename, "Add category" for a new one. */
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
    // Nothing is said until the button is pressed on it.
    const error = tried ? problem(name) : "";

    async function save() {
        setTried(true);
        if (problem(name)) return;
        const ok = await runAction(() => onSubmit(name), { setBusy });
        if (ok) setOpen(false);
    }

    return (
        <FormDialog
            trigger={trigger}
            open={open}
            size="sm"
            title={title}
            description={note}
            pending={busy}
            saveLabel={submitLabel}
            savingLabel={busyLabel}
            dirty={name !== initial}
            onOpen={() => {
                setDraft(initial);
                setTried(false);
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            onSubmit={save}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={fieldId}>{label}</Label>
                <Input
                    id={fieldId}
                    value={draft}
                    disabled={busy}
                    placeholder={placeholder}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${fieldId}-error` : undefined}
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
        </FormDialog>
    );
}
