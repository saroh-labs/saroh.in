import type { ReactNode } from "react";

import { Container } from "../layout/container";
import { Pill } from "../links/pill";
import { ScreenshotFrame } from "../media/screenshot-frame";
import type { ShotView } from "../media/shot";
import { Eyebrow } from "./eyebrow";

/**
 * Home's opening (Home design, "saroh" hero copy): the eyebrow, the headline
 * with its Saffron initials (read whole through `aria-label`), the sub, the
 * site's buttons (`actions`), the free-plan line and the chips, beside the
 * dashboard shot. Side by side from about 900px, stacked below it, as the
 * design's wrapping flex row does. With no shot the words take the row.
 */
export function HomeHero({
    eyebrow,
    headlineLabel,
    headline,
    sub,
    actions,
    freeLine,
    chips,
    shot,
}: {
    eyebrow: string;
    /** The headline as one sentence, for a screen reader. */
    headlineLabel: string;
    headline: readonly { initial: string; rest: string }[];
    sub: string;
    actions?: ReactNode;
    /** The free-plan line, from the site's read of its plans. */
    freeLine: string;
    chips: readonly string[];
    shot?: ShotView;
}) {
    return (
        <Container
            as="header"
            className="flex flex-wrap items-center gap-14 pt-[72px]"
        >
            <div className="grid flex-[1_1_380px] gap-[22px]">
                <Eyebrow>{eyebrow}</Eyebrow>
                <h1
                    aria-label={headlineLabel}
                    className="m-0 font-display text-mk-hero font-bold [text-wrap:balance]"
                >
                    {headline.map((w) => (
                        <span key={w.initial} aria-hidden>
                            <span className="text-brand-500">{w.initial}</span>
                            {w.rest}
                        </span>
                    ))}
                </h1>
                <p className="m-0 max-w-[50ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                    {sub}
                </p>
                {actions}
                <div className="grid gap-3">
                    <p className="m-0 text-mk-note text-muted-foreground">
                        {freeLine}
                    </p>
                    <ul
                        aria-label="Included"
                        className="m-0 flex list-none flex-wrap gap-2 p-0"
                    >
                        {chips.map((chip) => (
                            <li key={chip}>
                                <Pill>{chip}</Pill>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            {shot ? (
                <ScreenshotFrame
                    shot={shot}
                    variant="home"
                    priority
                    // Side by side from about 900px; below, the words come first.
                    priorityFrom="(min-width: 900px)"
                    sizes="(min-width: 1280px) 640px, 100vw"
                    className="flex-[1.2_1_440px]"
                />
            ) : null}
        </Container>
    );
}
