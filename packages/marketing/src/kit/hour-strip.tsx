import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { ring } from "../ring";
import type { HourTint } from "./time";
import { hourLabel, hourTint } from "./time";

/** One hour in a day's index. */
export interface HourStop {
    /** "HH:MM", 24-hour. */
    at: string;
    /** What happens, linked to its scene. */
    line: string;
    /** The scene's anchor: "#9am", or a page and anchor. */
    href: string;
    /** Shown instead of the hour label, as "Tue 7 am". */
    label?: string;
    /** The part of Saroh it uses, and where that's explained. */
    feature?: { label: string; href: string };
}

const TINT: Record<HourTint, string> = {
    dawn: "hsl(var(--mk-dawn))",
    noon: "hsl(var(--mk-noon))",
    afternoon: "hsl(var(--mk-afternoon))",
    dusk: "hsl(var(--mk-dusk))",
    lamp: "hsl(var(--mk-lamp))",
};

/** The bar's light: each stop's tint, where its dot sits. */
export function stripGradient(stops: readonly { at: string }[]): string {
    const n = stops.length;
    const parts = stops.map(
        (s, i) =>
            `${TINT[hourTint(s.at)]} ${Math.round(((i + 0.5) / n) * 100)}%`,
    );
    return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/**
 * A day's index (the trade page under the hero): the light of the day as a
 * bar in the hour tints, a dot at each hour, and under each dot the hour,
 * what happens (to its scene) and the part of Saroh it uses. `current` is
 * the hour the visitor is at, its dot Saffron. Scrolls sideways inside
 * itself on a phone.
 */
export function HourStrip({
    title,
    stops,
    current,
    className,
}: {
    /** "Her day, hour by hour": a small heading, not a section's h2 size. */
    title: ReactNode;
    stops: readonly HourStop[];
    current?: string;
    className?: string;
}) {
    return (
        <nav
            aria-label={typeof title === "string" ? title : undefined}
            className={className}
        >
            <h2 className="m-0 mb-5 font-sans text-[15px] font-semibold tracking-normal text-mk-copy">
                {title}
            </h2>
            <div className="-mr-mk-gutter overflow-x-auto pr-mk-gutter [scrollbar-width:none] min-[760px]:mr-0 min-[760px]:pr-0 [&::-webkit-scrollbar]:hidden">
                <ol
                    className="relative m-0 grid min-w-[880px] list-none p-0 min-[760px]:min-w-0"
                    style={{
                        gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))`,
                    }}
                >
                    <span
                        aria-hidden
                        className="absolute inset-x-0 top-[5px] h-2.5 rounded-full border border-border"
                        style={{ background: stripGradient(stops) }}
                    />
                    {stops.map((s) => {
                        const on = s.at === current;
                        return (
                            <li
                                key={s.href}
                                className="relative grid content-start gap-1.5 pr-4 pt-9"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "absolute left-6 top-0 size-5 -translate-x-1/2 rounded-full border-2",
                                        on
                                            ? "border-brand-500 bg-brand-500"
                                            : "border-foreground bg-background",
                                    )}
                                />
                                <span className="font-mono text-[14px] font-medium text-foreground">
                                    {s.label ?? hourLabel(s.at)}
                                </span>
                                <Link
                                    href={s.href}
                                    aria-current={on ? "true" : undefined}
                                    className={`rounded-sm text-[15px] leading-snug text-foreground no-underline hover:underline ${ring()}`}
                                >
                                    {s.line}
                                </Link>
                                {s.feature ? (
                                    <Link
                                        href={s.feature.href}
                                        className={`w-fit rounded-sm text-[13px] font-medium text-mk-copy underline decoration-border-strong decoration-1 underline-offset-[3px] hover:text-foreground ${ring()}`}
                                    >
                                        {s.feature.label}
                                    </Link>
                                ) : null}
                            </li>
                        );
                    })}
                </ol>
            </div>
        </nav>
    );
}
