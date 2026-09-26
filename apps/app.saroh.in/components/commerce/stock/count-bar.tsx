"use client";

import { Button } from "@saroh/ui/button";

/**
 * The bar that holds a count while it is being made (#527): what has been
 * counted so far, Cancel and Save count. Sticky at the foot of the screen,
 * above the phone's tab bar, so Save is in reach of the thumb.
 */
export function CountBar({
    status,
    canSave,
    saving,
    onCancel,
    onSave,
}: {
    status: string;
    canSave: boolean;
    saving: boolean;
    onCancel: () => void;
    onSave: () => void;
}) {
    return (
        <div className="sticky bottom-[var(--tab-bar-inset)] z-20 -mx-4 flex flex-wrap items-center gap-2.5 border-t border-border bg-background px-4 py-3 sm:-mx-[26px] sm:px-[22px]">
            <span
                role="status"
                className="flex-[1_1_240px] text-[13px] text-foreground/80"
            >
                {status}
            </span>
            <Button
                type="button"
                variant="outline"
                className="h-9 rounded-[9px] px-3.5 text-[12.5px] coarse:h-11"
                onClick={onCancel}
                disabled={saving}
            >
                Cancel
            </Button>
            <Button
                type="button"
                className="h-9 rounded-[9px] px-3.5 text-[12.5px] coarse:h-11"
                onClick={onSave}
                disabled={!canSave || saving}
            >
                {saving ? "Saving…" : "Save count"}
            </Button>
        </div>
    );
}
