import { cn } from "@saroh/ui/lib/utils";

import type { Tone } from "@/lib/stock/screen";

import { STOCK_TEXT } from "../stock-tones";

/**
 * The Stock design's colour roles on the app's tokens: danger, accent (low,
 * a count that differs) and ok text are the shared stock colours
 * (`STOCK_TEXT`); plain is the page's own text (`--text`).
 */
export const TEXT_TONE: Record<Tone, string> = {
    plain: "text-foreground",
    ...STOCK_TEXT,
};

/** The design's 11px pill: the tint with its 700 text, words always. */
export function pillClass(tone: Tone): string {
    return cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "ok" && "bg-success-subtle text-success-subtle-foreground",
        tone === "warn" && "bg-brand-subtle text-brand-subtle-foreground",
        tone === "danger" &&
            "bg-destructive-subtle text-destructive-subtle-foreground",
        (tone === "plain" || tone === "muted") &&
            "bg-muted text-neutral-600 dark:text-muted-foreground",
    );
}

/** The design's 32px row and card buttons. */
export const SMALL_BUTTON = "h-8 rounded-[8px] px-3 text-[12.5px] coarse:h-11";
