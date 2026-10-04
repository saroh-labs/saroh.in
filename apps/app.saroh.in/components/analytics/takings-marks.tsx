import { cn } from "@saroh/ui/lib/utils";

import type {
    Band,
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
 */

/** Darker is higher; on dark the ramp turns over, lighter is higher. */
const BAND: Record<Band, string> = {
    1: "bg-neutral-900 dark:bg-neutral-100",
    2: "bg-neutral-700 dark:bg-neutral-300",
    3: "bg-neutral-600 dark:bg-neutral-400",
};

/** The best week: Saffron 700, the design's accent-deep; 400 on dark. */
const PEAK = "bg-brand-700 dark:bg-brand-400";

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
 * Twelve bars, `spark` (34px, under the first answer) or `chart` (96px,
 * the figures' own). Heights are a share of the best week; a week that
 * took nothing keeps a sliver so the twelve stay countable.
 */
export function WeekBars({
    bars,
    label,
    size,
}: {
    bars: readonly WeekBar[];
    label: string;
    size: "spark" | "chart";
}) {
    const spark = size === "spark";
    return (
        <div
            role="img"
            aria-label={label}
            className={cn(
                "flex items-end",
                spark ? "h-[34px] gap-[3px]" : "h-24 gap-[5px]",
            )}
        >
            {bars.map((bar) => (
                <div
                    key={bar.start}
                    className={cn(
                        "flex-1",
                        spark
                            ? "min-h-[2px] rounded-t-[2px]"
                            : "min-h-[3px] rounded-t-[3px]",
                        bar.peak ? PEAK : BAND[bar.band],
                    )}
                    style={{ height: `${bar.heightPercent}%` }}
                />
            ))}
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
                className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] leading-[1.5] text-muted-foreground"
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
