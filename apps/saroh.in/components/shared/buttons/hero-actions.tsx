import type { ComponentProps } from "react";

import { TOUR_LABEL, TOUR_VIDEO } from "@/content/home";
import type { PlanId } from "@/lib/links";

import { ButtonLink } from "./button";
import { CtaLink } from "./cta-link";
import { DemoLink } from "./demo-link";

/**
 * A hero's buttons, and the closing band's (DEC-195, A6): the start button,
 * the live demo where one is on, then "See it in action · 2 min" once a tour
 * video is configured (KTD-12, deviation D-3). On Ink the start button is
 * Saffron and the tour button outlined on Ink.
 */
export function HeroActions({
    src,
    plan,
    template,
    demo,
    onInk = false,
    tourHref = "/#video",
}: {
    /** The start button's analytics source, e.g. `home-hero`. */
    src: string;
    plan?: PlanId;
    template?: { slug: string; name: string };
    demo?: ComponentProps<typeof DemoLink>;
    onInk?: boolean;
    /** Where the tour plays; Home links to its own `#video`. */
    tourHref?: string;
}) {
    return (
        <div className="flex flex-wrap gap-3">
            <CtaLink
                src={src}
                plan={plan}
                template={template}
                variant={onInk ? "saffron" : "primary"}
            />
            {demo ? <DemoLink {...demo} /> : null}
            {TOUR_VIDEO ? (
                <ButtonLink
                    href={tourHref}
                    variant={onInk ? "secondary-on-ink" : "secondary"}
                    play
                >
                    {TOUR_LABEL}
                </ButtonLink>
            ) : null}
        </div>
    );
}
