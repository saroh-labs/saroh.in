"use client";

import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { useId } from "react";

/**
 * One labelled switch with a line under it saying what on and off do — the
 * shape the block editors' options share (the hours block's "List closed
 * days", the template polish's derived counts and layouts).
 *
 * The caller maps the switch to the stored value, so a block can store its
 * default as ABSENT and a section untouched here publishes exactly as before.
 */
export function OptionSwitch({
    label,
    checked,
    onChange,
    note,
}: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
    note?: string;
}) {
    const id = useId();
    const noteId = useId();
    return (
        <div className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={id}>{label}</Label>
                <Switch
                    id={id}
                    checked={checked}
                    onCheckedChange={onChange}
                    aria-describedby={note ? noteId : undefined}
                />
            </div>
            {note ? (
                <p id={noteId} className="text-xs text-muted-foreground">
                    {note}
                </p>
            ) : null}
        </div>
    );
}
