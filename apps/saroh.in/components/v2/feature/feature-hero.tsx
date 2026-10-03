import Link from "next/link";

import { TOUR_VIDEO } from "@/content/home";
import type { Feature } from "@/content/types";

import { ButtonLink } from "../button";
import { Container } from "../container";
import { CtaLink } from "../cta-link";
import { ScreenshotFrame } from "../screenshot-frame";

/**
 * A feature page's opening (Features template): the "Features / {name}"
 * breadcrumb, the headline, the sub, the start button, the free-plan line,
 * then the page's screenshot, which enlarges on click.
 *
 * "See it in action · 2 min" shows only once a tour video is configured
 * (KTD-12, deviation D-3). The free-plan line comes from the pricing
 * catalogue, the placeholder line without one (the public-repo rule).
 */
export function FeatureHero({
    feature,
    freeLine,
}: {
    feature: Feature;
    /** The free-plan line, from the catalogue (`freePlanLine`). */
    freeLine: string;
}) {
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-5 pt-[72px]"
            >
                <nav aria-label="Breadcrumb">
                    <ol className="m-0 flex list-none items-center gap-2 p-0 text-[14px] text-muted-foreground">
                        <li>
                            <Link
                                href="/#features"
                                className="cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                            >
                                Features
                            </Link>
                        </li>
                        <li aria-hidden>/</li>
                        <li
                            aria-current="page"
                            className="font-semibold text-brand-700"
                        >
                            {feature.name}
                        </li>
                    </ol>
                </nav>
                <h1 className="m-0 max-w-[16ch] font-display text-mk-display font-bold [text-wrap:balance]">
                    {feature.headline}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {feature.sub}
                </p>
                <div className="flex flex-wrap gap-3">
                    <CtaLink src={`feature-${feature.slug}`} />
                    {TOUR_VIDEO ? (
                        <ButtonLink href="/#video" variant="secondary" play>
                            See it in action · 2 min
                        </ButtonLink>
                    ) : null}
                </div>
                <div className="text-mk-note text-muted-foreground">
                    {freeLine}
                </div>
            </Container>
            <Container className="pt-14">
                <ScreenshotFrame
                    shot={feature.hero.shot}
                    alt={feature.hero.alt}
                    variant="hero"
                    zoomable
                    priority
                    sizes="(min-width: 1280px) 1168px, 100vw"
                />
            </Container>
        </>
    );
}
