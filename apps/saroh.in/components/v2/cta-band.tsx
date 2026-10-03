import { cn } from "@/lib/cn";

import { CTA_BAND, TOUR_VIDEO } from "@/content/home";
import type { PlanId } from "@/lib/links";

import { ButtonLink } from "./button";
import { Container } from "./container";
import { CtaLink } from "./cta-link";

/**
 * The dark band every page closes with: the page's own title, the shared
 * body, the Saffron start button and "No card needed to start." The "See it
 * in action · 2 min" button shows only once a tour video is configured
 * (KTD-12, deviation D-3).
 */
export function CtaBand({
    title,
    src,
    plan,
    body = CTA_BAND.body,
    note = CTA_BAND.note,
    className,
}: {
    title: string;
    /** Analytics source for the start button, e.g. `home-band`. */
    src: string;
    plan?: PlanId;
    body?: string;
    note?: string;
    /** E.g. the Features and Solutions designs' `pt-[120px]` (Home's is 110). */
    className?: string;
}) {
    return (
        <Container className={cn("pt-[110px]", className)}>
            <div className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background">
                <div className="grid flex-[1_1_420px] gap-4">
                    <h2 className="m-0 font-display text-mk-band font-bold [text-wrap:balance]">
                        {title}
                    </h2>
                    <p className="m-0 max-w-[46ch] text-mk-band-body text-mk-on-ink [text-wrap:pretty]">
                        {body}
                    </p>
                </div>
                <div className="grid justify-items-start gap-3">
                    <div className="flex flex-wrap gap-3">
                        <CtaLink src={src} plan={plan} variant="saffron" />
                        {TOUR_VIDEO ? (
                            <ButtonLink
                                href="/#video"
                                variant="secondary-on-ink"
                                play
                            >
                                See it in action · 2 min
                            </ButtonLink>
                        ) : null}
                    </div>
                    <span className="text-mk-note text-mk-on-ink-muted">
                        {note}
                    </span>
                </div>
            </div>
        </Container>
    );
}
