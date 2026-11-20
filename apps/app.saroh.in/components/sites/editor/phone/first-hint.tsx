"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

const SEEN_KEY = "saroh.editor.phone-hint-seen";

/** Whether the hint was put away before; true when storage can't be read. */
function seenBefore(): boolean {
    try {
        return window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
        // No storage (a private window, blocked site data): no hint at all.
        return true;
    }
}

/**
 * The first visit's one line over the bar (`fix/WXNHome`): "Tap any part
 * of the page to change it. Shown once." Got it puts it away for good on
 * this browser. Drawn only on the client (the phone editor is).
 */
export function FirstHint({ hidden }: { hidden: boolean }) {
    const [seen, setSeen] = useState(seenBefore);
    if (seen || hidden) return null;
    return (
        <div
            role="status"
            data-first-hint=""
            className="relative z-10 flex min-h-12 shrink-0 items-center gap-2 bg-foreground py-0.5 pl-3.5 pr-1 text-[0.8125rem] text-background"
        >
            <span className="min-w-0 flex-1">
                Tap any part of the page to change it. Shown once.
            </span>
            <Button
                type="button"
                variant="ghost"
                onClick={() => {
                    try {
                        window.localStorage.setItem(SEEN_KEY, "1");
                    } catch {
                        // Not kept: it goes for this visit only.
                    }
                    setSeen(true);
                }}
                className="h-11 shrink-0 px-3 text-sm font-semibold text-background hover:bg-background/15 hover:text-background"
            >
                Got it
            </Button>
        </div>
    );
}
