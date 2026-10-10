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

/** The badge a stock tone wears; `StatusBadge` draws it, words always. */
export const PILL_TONE: Record<
    Tone,
    "success" | "warning" | "error" | "neutral"
> = {
    ok: "success",
    warn: "warning",
    danger: "error",
    plain: "neutral",
    muted: "neutral",
};

/** The design's 32px row and card buttons. */
export const SMALL_BUTTON = "h-8 rounded-[8px] px-3 text-[12.5px] coarse:h-11";
