import type { ReactNode } from "react";

import { Container } from "../layout/container";
import { Eyebrow } from "../sections/eyebrow";

/** A pricing page's opening: the eyebrow, title, intro and the site's button. */
export function PricingHero({
    eyebrow,
    title,
    intro,
    actions,
}: {
    eyebrow: string;
    title: string;
    intro: string;
    actions?: ReactNode;
}) {
    return (
        <Container
            as="header"
            className="grid justify-items-start gap-[18px] pt-[72px]"
        >
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="m-0 max-w-[16ch] font-display text-mk-pricing-hero font-bold [text-wrap:balance]">
                {title}
            </h1>
            <p className="m-0 max-w-[58ch] text-mk-intro text-mk-copy [text-wrap:pretty]">
                {intro}
            </p>
            {actions}
        </Container>
    );
}
