import { cn } from "@saroh/ui/lib/utils";

import type {
    Band,
    BarWindow,
    PlaceShare,
    WeekBar,
} from "@/lib/analytics/takings-figures";

/**
 * The marks Insights draws its takings with (DEC-075, the Insights
 * Variants design): twelve weekly bars, banded greys with the best week in
 * the accent, and the split by where the money came from. The class
 * strings live here because Tailwind does not scan `lib/`.
 *
 * Each is `role="img"` with its own label, written from the same figures
 * as the sentences: the bars are never the only way to read a number.
 * The figures' chart, whose bars are buttons, is `takings-chart.tsx`.
 */

/** Darker is higher; on dark the ramp turns over, lighter is higher. */
const BAND: Record<Band, string> = {
    1: "bg-neutral-900 dark:bg-neutral-100",
    2: "bg-neutral-700 dark:bg-neutral-300",
    3: "bg-neutral-600 dark:bg-neutral-400",
};

/** The best week: Saffron 700, the design's accent-deep; 400 on dark. */
const PEAK = "bg-brand-700 dark:bg-brand-400";

/** The week in progress: hatched, so it never reads as a whole week. */
export const SO_FAR =
    "bg-[repeating-linear-gradient(135deg,currentColor_0_2px,transparent_2px_6px)] text-foreground/55 ring-1 ring-inset ring-foreground/30";

/** What paints a whole week's bar. */
export function barTone(bar: WeekBar): string {
    return bar.peak ? PEAK : BAND[bar.band];
}

/**
 * The first answer's spark sets the last four weeks against the four
 * before (F5): those two at full and half strength, the rest faint.
 */
const WINDOW: Record<BarWindow, string> = {
    LAST4: "",
    PRIOR4: "opacity-45",
    EARLIER: "opacity-15",
};

/** The chart series in the design's order: W6 step 2, then step 5, then the rest. */
const PLACE = [
    "bg-chart-2",
    "bg-chart-5",
    "bg-chart-1",
    "bg-chart-4",
    "bg-chart-3",
];

export function placeTone(index: number): string {
    return PLACE[index % PLACE.length];
}

/**
 * The twelve weeks as a spark (34px) under "How was the last month?",
 * the four compared weeks against the four before. Heights are a share
 * of the chart's scale; a week that took nothing keeps a sliver so the
 * twelve stay countable. The figures' own chart is `takings-chart.tsx`.
 */
export function WeekSpark({
    bars,
    label,
    lastLabel,
    priorLabel,
}: {
    bars: readonly WeekBar[];
    label: string;
    lastLabel: string;
    priorLabel: string;
}) {
    return (
        <div>
            <div
                role="img"
                aria-label={label}
                className="flex h-[34px] items-end gap-[3px]"
            >
                {bars.map((bar) => (
                    <div
                        key={bar.start}
                        className={cn(
                            "min-h-[2px] flex-1 rounded-t-[2px]",
                            barTone(bar),
                            WINDOW[bar.window],
                        )}
                        style={{ height: `${bar.heightPercent}%` }}
                    />
                ))}
            </div>
            <ul
                aria-hidden
                className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-[1.5] text-muted-foreground"
            >
                <li className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-[2px] bg-neutral-900 dark:bg-neutral-100" />
                    {lastLabel}
                </li>
                <li className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-[2px] bg-neutral-900 opacity-45 dark:bg-neutral-100" />
                    {priorLabel}
                </li>
            </ul>
        </div>
    );
}

/**
 * One segment per place, sized by its share, with a legend in words
 * beneath: colour alone never says which place is which.
 */
export function PlaceSplit({
    places,
    label,
    name,
}: {
    places: readonly PlaceShare[];
    label: string;
    name: (place: PlaceShare) => string;
}) {
    return (
        <div>
            <div
                role="img"
                aria-label={label}
                className="flex h-2.5 overflow-hidden rounded-full"
            >
                {places.map((place, i) => (
                    <div
                        key={place.key}
                        className={placeTone(i)}
                        style={{ width: `${place.percent}%` }}
                    />
                ))}
            </div>
            <ul
                aria-hidden
                className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-[1.5] text-muted-foreground"
            >
                {places.map((place, i) => (
                    <li key={place.key} className="flex items-center gap-1.5">
                        <span
                            className={cn(
                                "size-2 shrink-0 rounded-full",
                                placeTone(i),
                            )}
                        />
                        <span className="tabular-nums">
                            {name(place)} {place.percent}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
