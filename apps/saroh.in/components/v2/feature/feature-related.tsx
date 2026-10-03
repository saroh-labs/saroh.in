import { featureHref, features } from "@/content/features";
import { solutionHref, solutions } from "@/content/solutions";
import type { Feature } from "@/content/types";

import { CardLink } from "../card-link";
import { Container } from "../container";
import { Eyebrow } from "../eyebrow";
import { PillLink } from "../pill";
import { SectionHeading } from "../section-heading";

/**
 * "What it does": the page's points, each under a hairline, as many columns
 * as fit at 280px.
 */
export function FeaturePoints({ feature }: { feature: Feature }) {
    return (
        <Container
            as="section"
            aria-labelledby="what-it-does"
            className="grid gap-9 pt-[130px]"
        >
            <SectionHeading id="what-it-does" title="What it does" size="md" />
            <ul className="m-0 grid list-none gap-x-10 gap-y-8 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
                {feature.points.map((point) => (
                    <li
                        key={point.title}
                        className="grid content-start gap-1.5 border-t border-border pt-4"
                    >
                        <span className="text-[16.5px] font-semibold">
                            {point.title}
                        </span>
                        <span className="text-mk-card-body text-mk-copy [text-wrap:pretty]">
                            {point.body}
                        </span>
                    </li>
                ))}
            </ul>
        </Container>
    );
}

/**
 * "Works with": the page's lead, then a card for each feature it works with
 * (its name, its short line, "See {name} →"), four across on a desk.
 */
export function FeatureWorksWith({ feature }: { feature: Feature }) {
    return (
        <Container
            as="section"
            aria-labelledby="works-with"
            className="grid gap-7 pt-[130px]"
        >
            <div className="grid gap-2">
                <SectionHeading id="works-with" title="Works with" size="md" />
                <p className="m-0 text-[16.5px] text-mk-copy [text-wrap:pretty]">
                    {feature.worksLead}
                </p>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,max(220px,calc((100%_-_48px)/4))),1fr))]">
                {feature.worksWith.map((slug) => (
                    <CardLink
                        key={slug}
                        href={featureHref(slug)}
                        title={features[slug].name}
                        body={features[slug].cardLine}
                    />
                ))}
            </div>
        </Container>
    );
}

/** "Used by": a chip for each solution page the feature serves. */
export function FeatureUsedBy({ feature }: { feature: Feature }) {
    return (
        <Container
            as="section"
            aria-labelledby="used-by"
            className="grid gap-4 pt-[130px]"
        >
            <Eyebrow id="used-by" role="heading" aria-level={2}>
                Used by
            </Eyebrow>
            <div className="flex flex-wrap gap-3">
                {feature.usedBy.map((slug) => (
                    <PillLink key={slug} href={solutionHref(slug)} size="lg">
                        {solutions[slug].longName}
                    </PillLink>
                ))}
            </div>
        </Container>
    );
}
