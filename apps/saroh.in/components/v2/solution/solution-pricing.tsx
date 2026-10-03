import Link from "next/link";

import type { PlanTeaserView } from "@/lib/plan-teasers";

import { Container } from "../container";
import { PlanTeaserCard } from "./plan-teaser-card";

/**
 * "Pricing for shops": the featured plan with the page's fit line, a second
 * plan, and the link to compare every plan. Takes the teasers ready-made
 * (`lib/plan-teasers.ts`).
 */
export function SolutionPricing({
    title,
    plans,
    footnote,
    src,
}: {
    title: string;
    plans: PlanTeaserView[];
    /** The words before "Compare every plan", when there are any. */
    footnote: string | null;
    src: string;
}) {
    return (
        <Container
            as="section"
            aria-labelledby="pricing-title"
            className="grid gap-[18px] pt-[130px]"
        >
            <h2
                id="pricing-title"
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                {title}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
                {plans.map((teaser) => (
                    <PlanTeaserCard
                        key={teaser.plan}
                        teaser={teaser}
                        src={src}
                    />
                ))}
            </div>
            <div className="text-mk-note text-muted-foreground">
                {footnote ? `${footnote} ` : null}
                <Link
                    href="/pricing"
                    className="rounded-sm text-brand-700 no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                >
                    Compare every plan
                </Link>
            </div>
        </Container>
    );
}
