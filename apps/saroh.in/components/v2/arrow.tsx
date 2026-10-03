import { ArrowRight } from "lucide-react";

/**
 * The "→" after a link's words ("See Orders →", "Shops and bakeries →").
 * The self-hosted Geist is a latin subset without U+2192, so a typed arrow
 * falls back to a system face and draws long and thin; this draws the short
 * arrow the design's full Geist shows, sized to the text.
 */
export function Arrow() {
    return (
        <ArrowRight
            aria-hidden
            strokeWidth={2.25}
            className="ml-[0.25em] inline-block size-[0.9em] align-[-0.1em]"
        />
    );
}
