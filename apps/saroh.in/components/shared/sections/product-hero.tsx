import type { ComponentProps, ReactNode } from "react";

import type { ShotRef } from "@/content/types";

import { HeroActions } from "../buttons/hero-actions";
import { Container } from "../layout/container";
import { ScreenshotFrame } from "../media/screenshot-frame";

/**
 * A feature or solution page's opening (DEC-195, A5): the breadcrumb, the
 * headline, the sub, the hero's buttons (`HeroActions`), the free-plan line,
 * then the page's screenshot, which enlarges on click, and its note. A page
 * with no screen captured yet has neither.
 */
export function ProductHero({
    crumb,
    headline,
    sub,
    narrow = false,
    actions,
    freeLine,
    shot,
    note,
}: {
    crumb: ReactNode;
    headline: string;
    sub: string;
    /** The feature template's 16ch headline; a solution's is 17ch. */
    narrow?: boolean;
    actions: ComponentProps<typeof HeroActions>;
    /** The free-plan line, from the catalogue (`freePlanLine`). */
    freeLine: string;
    shot?: ShotRef;
    note?: string;
}) {
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-5 pt-[72px]"
            >
                {crumb}
                <h1
                    className={`m-0 ${narrow ? "max-w-[16ch]" : "max-w-[17ch]"} font-display text-mk-display font-bold [text-wrap:balance]`}
                >
                    {headline}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {sub}
                </p>
                <HeroActions {...actions} />
                <p className="m-0 text-mk-note text-muted-foreground">
                    {freeLine}
                </p>
            </Container>
            {shot ? (
                <Container className="pt-14">
                    <ScreenshotFrame
                        shot={shot.shot}
                        alt={shot.alt}
                        variant="hero"
                        zoomable
                        priority
                        sizes="(min-width: 1280px) 1168px, 100vw"
                    />
                    {note ? (
                        <p className="m-0 mt-3.5 text-sm text-muted-foreground">
                            {note}
                        </p>
                    ) : null}
                </Container>
            ) : null}
        </>
    );
}
