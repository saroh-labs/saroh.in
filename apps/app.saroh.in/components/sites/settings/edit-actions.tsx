"use client";

import { Button } from "@saroh/ui/button";

import type { SettingsSheet } from "@/lib/sites/settings-edit";
import { settingsEditId } from "@/lib/sites/settings-edit";

import type { SettingsSave } from "./use-settings-save";

/**
 * A row's one action: its Edit (or Write, Add, Build), which opens the
 * row's sheet. The row keeps saying what is saved; nothing is edited in
 * place. Every row's Edit waits while a save runs.
 */
export function EditAction({
    row,
    state,
    label = "Edit",
    name,
}: {
    row: SettingsSheet;
    state: SettingsSave;
    /** The verb at rest: "Write" or "Add" when nothing is set yet. */
    label?: string;
    /** What it edits, for a screen reader: "Edit title". */
    name: string;
}) {
    return (
        <Button
            id={settingsEditId(row)}
            size="sm"
            variant="outline"
            disabled={state.pending}
            aria-haspopup="dialog"
            aria-label={name}
            onClick={() => state.open(row)}
        >
            {label}
        </Button>
    );
}
