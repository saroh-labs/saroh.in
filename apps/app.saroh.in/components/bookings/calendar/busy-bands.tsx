import { formatClockRange } from "@/lib/format/datetime";
import { BUSY_SOURCE, BUSY_WORD } from "@/lib/services/busy-blocks";
import type { Span } from "@/lib/services/diary";

import { at, tall } from "./geometry";

/** The shortest busy time with room for its words: 30 minutes is 24px. */
const LABEL_MINUTES = 30;

/**
 * Google busy times in one column of the diary (BKVGoogle): a quiet band
 * that says "Busy · Google Calendar" and nothing about what the event is
 * (Saroh sees busy or free, never the event). It lets a click through to
 * whatever is under it and is named for a screen reader, so it is never the
 * tint alone that says it.
 */
export function BusyBands({
    spans,
    from,
}: {
    spans: readonly Span[];
    from: number;
}) {
    return (
        <>
            {spans.map(([a, b]) => (
                <div
                    key={`g${a}`}
                    role="img"
                    aria-label={`${BUSY_WORD} ${formatClockRange(a, b)}, from ${BUSY_SOURCE}`}
                    data-google-busy=""
                    className="pointer-events-none absolute inset-x-0.5 z-[1] overflow-hidden rounded-[6px] border border-dashed border-border-strong bg-muted/80"
                    style={{ top: at(a, from), height: tall(a, b) }}
                >
                    {b - a >= LABEL_MINUTES ? (
                        <span
                            data-ph-unmask=""
                            className="absolute left-1.5 top-1 truncate pr-1 text-[11px] font-medium leading-4 text-muted-foreground"
                        >
                            {BUSY_WORD} · {BUSY_SOURCE}
                        </span>
                    ) : null}
                </div>
            ))}
        </>
    );
}
