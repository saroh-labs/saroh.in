import Link from "next/link";

import { TOUR_VIDEO } from "@/content/home";
import type { Solution } from "@/content/types";

import { ButtonLink } from "../button";
import { Container } from "../container";
import { CtaLink } from "../cta-link";
import { ScreenshotFrame } from "../screenshot-frame";

/**
 * The top of a solution page: "Solutions / Gyms & studios", the headline,
 * the sub, the start button (and "See it in action" once a video is set,
 * deviation D-3), the free-plan line, then the hero shot and its note.
 */
export function SolutionHero({
    solution,
    freeLine,
}: {
    solution: Solution;
    /** The free-plan line (`FREE_PLAN_LINE`). */
    freeLine: string;
}) {
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-5 pt-[72px]"
            >
                <nav
                    aria-label="Breadcrumb"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <Link
                        href="/#solutions"
                        className="rounded-sm text-muted-foreground no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                    >
                        Solutions
                    </Link>
                    <span aria-hidden>/</span>
                    <span
                        aria-current="page"
                        className="font-semibold text-brand-700"
                    >
                        {solution.name}
                    </span>
                </nav>
                <h1 className="m-0 max-w-[17ch] font-display text-mk-display font-bold [text-wrap:balance]">
                    {solution.headline}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {solution.sub}
                </p>
                <div className="flex flex-wrap gap-3">
                    <CtaLink src={`solutions-${solution.slug}-hero`} />
                    {TOUR_VIDEO ? (
                        <ButtonLink href="/#video" variant="secondary" play>
                            See it in action · 2 min
                        </ButtonLink>
                    ) : null}
                </div>
                <p className="m-0 text-mk-note text-muted-foreground">
                    {freeLine}
                </p>
            </Container>
            <Container className="pt-14">
                <ScreenshotFrame
                    shot={solution.hero.shot}
                    alt={solution.hero.alt}
                    variant="hero"
                    zoomable
                    priority
                    sizes="(min-width: 1280px) 1168px, 100vw"
                />
                <p className="m-0 mt-3.5 text-sm text-muted-foreground">
                    {solution.heroNote}
                </p>
            </Container>
        </>
    );
}
