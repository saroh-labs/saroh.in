import type { LayerTone } from "@/lib/calendar/layers";

/**
 * Tailwind classes per layer tone (`--layer-*`, globals.css) — whole strings,
 * and here rather than in `lib/`, because Tailwind only keeps the classes it
 * finds in the folders it scans.
 */
export const TONE_FILL: Record<LayerTone, string> = {
    1: "bg-layer-1",
    2: "bg-layer-2",
    3: "bg-layer-3",
    4: "bg-layer-4",
    5: "bg-layer-5",
    6: "bg-layer-6",
};

export const TONE_BORDER: Record<LayerTone, string> = {
    1: "border-layer-1",
    2: "border-layer-2",
    3: "border-layer-3",
    4: "border-layer-4",
    5: "border-layer-5",
    6: "border-layer-6",
};
