import type { ReactNode } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";
import type { SectionTone } from "../sections/section";
import { TONE_BAND } from "../sections/section";
import { SunArc } from "./sun-arc";
import { hourAnchor, hourLabel, hourTint } from "./time";

/**
 * One hour of a trade's day (Solutions only): a band in that hour's light,
 * the sun's place and the hour large on the left with a line of mood, and
 * on the right the scene's h2, its lead and its picture. Its id is the
 * hour's anchor ("9am"), which every day link points at
 * (`/for/home-bakers#9am`). `used` is the row of "how it works" chips under
 * the picture. Words and pictures are the page's, from its world.
 */
export function DayScene({
    at,
    id = hourAnchor(at),
    title,
    mood,
    lead,
    used,
    tone = hourTint(at),
    children,
    className,
}: {
    /** "HH:MM", 24-hour. */
    at: string;
    id?: string;
    title: ReactNode;
    mood?: ReactNode;
    lead?: ReactNode;
    used?: ReactNode;
    tone?: SectionTone;
    children?: ReactNode;
    className?: string;
}) {
    const [hour, half] = hourLabel(at).split(" ");
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className={cn(
                "scroll-mt-[calc(var(--mk-nav-h)+16px)]",
                TONE_BAND[tone],
            )}
        >
            <Container
                className={cn(
                    "grid grid-cols-[minmax(0,1fr)] gap-4 py-8 min-[760px]:grid-cols-[200px_minmax(0,1fr)] min-[760px]:gap-12 min-[760px]:py-[120px]",
                    className,
                )}
            >
                <div className="grid content-start gap-4 max-[759px]:grid-cols-[auto_auto_minmax(0,1fr)] max-[759px]:items-center max-[759px]:gap-3">
                    <SunArc at={at} className="max-[759px]:w-11" />
                    <p
                        aria-hidden
                        className="m-0 flex items-start gap-1 font-display text-[44px] font-bold leading-[0.86] tracking-[-0.05em] min-[760px]:text-[120px]"
                    >
                        {hour}
                        <small className="mt-0.5 text-[15px] font-medium tracking-[-0.01em] text-mk-copy min-[760px]:mt-2 min-[760px]:text-[26px]">
                            {half}
                        </small>
                    </p>
                    {mood ? (
                        <p className="m-0 text-[16px] leading-normal text-mk-copy max-[759px]:border-l max-[759px]:border-border max-[759px]:pl-3 max-[759px]:text-[13px] max-[759px]:leading-snug min-[760px]:max-w-[220px]">
                            {mood}
                        </p>
                    ) : null}
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 min-[760px]:gap-6">
                    <h2
                        id={`${id}-title`}
                        className="m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        <span className="sr-only">{hourLabel(at)}: </span>
                        {title}
                    </h2>
                    {lead ? (
                        <p className="m-0 max-w-[62ch] text-mk-kit-lead text-mk-copy [text-wrap:pretty]">
                            {lead}
                        </p>
                    ) : null}
                    {children ? (
                        <div className="mt-2 min-w-0 min-[760px]:mt-8">
                            {children}
                        </div>
                    ) : null}
                    {used ? (
                        <div className="flex flex-wrap items-center gap-2.5">
                            {used}
                        </div>
                    ) : null}
                </div>
            </Container>
        </section>
    );
}
