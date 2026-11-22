"use client";

import { Button } from "@saroh/ui/button";
import { Images } from "lucide-react";
import { createContext, useContext } from "react";

/**
 * How a section's photo field opens the sheet (`fix/WXKMedia`): the
 * inspector provides it for the selected section; without it (a reader,
 * the phone, a form outside the editor) the field keeps today's picker.
 */
export const PhotoSheetOpener = createContext<((field: string) => void) | null>(
    null,
);

/** A photo field's way into the sheet, where the editor provides one. */
export function PhotoSheetButton({
    field,
    hasPhoto,
}: {
    field: string;
    hasPhoto: boolean;
}) {
    const open = useContext(PhotoSheetOpener);
    if (!open) return null;
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1.5"
            onClick={() => open(field)}
        >
            <Images aria-hidden className="mr-1.5 size-3.5" />
            {hasPhoto
                ? "Replace, focus and describe…"
                : "Choose from your photos…"}
        </Button>
    );
}
