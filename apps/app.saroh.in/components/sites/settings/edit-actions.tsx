"use client";

import { Button } from "@saroh/ui/button";

import type { EditingRow, SettingsSave } from "./use-settings-save";

/**
 * A row's one action: its Edit (or Write, Add, Build) at rest, and Save
 * with Cancel while it is open. Save says "Saving…" for the row whose save
 * is in flight, and every row's buttons wait while any save runs.
 */
export function EditActions({
    row,
    state,
    editLabel = "Edit",
    onSave,
    onCancel,
}: {
    row: EditingRow;
    state: SettingsSave;
    /** The verb at rest: "Write" or "Add" when nothing is set yet. */
    editLabel?: string;
    onSave: () => void;
    /** Put the field back as it was saved; the row closes after. */
    onCancel: () => void;
}) {
    const { editing, setEditing, saving, pending } = state;
    if (editing !== row) {
        return (
            <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                {editLabel}
            </Button>
        );
    }
    return (
        <div className="flex gap-2">
            <Button
                size="sm"
                variant="brand"
                disabled={pending}
                onClick={onSave}
            >
                {saving === row ? "Saving…" : "Save"}
            </Button>
            <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                    onCancel();
                    setEditing(null);
                }}
            >
                Cancel
            </Button>
        </div>
    );
}
