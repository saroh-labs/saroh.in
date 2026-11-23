"use client";

import { cn } from "@saroh/ui/lib/utils";

/**
 * "Preview only · not saved" (ERVPreviewLabel): shown over the canvas while
 * a custom colour is drawn on it and not yet kept. An ink pill with a saffron
 * dot; `role="status"` so a screen reader hears it once. It goes the moment
 * the colour is kept, cancelled or the Site colours tab is chosen.
 */
export function PreviewLabel({ className }: { className?: string }) {
    return (
        <span
            role="status"
            data-preview-label=""
            className={cn(
                "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-2.5 text-[12.5px] font-semibold text-background before:size-1.5 before:rounded-full before:bg-[#EFBA50] before:content-['']",
                className,
            )}
        >
            Preview only · not saved
        </span>
    );
}
