import Link from "next/link";

import { home } from "@/content/home";
import type { PlanTeaserView } from "@/lib/plan-teasers";

import { Arrow } from "../arrow";
import { Container } from "../container";
import { PlanTeaserCard } from "../solution/plan-teaser-card";

/**
 * Home's pricing teaser (`#pricing`): every plan the catalogue offers, its
 * highlighted plan in Ink, then "Billed monthly. Prices before GST." and
 * "Compare every plan →". Takes the teasers ready-made
 * (`lib/plan-teasers.ts` `homePlanTeasers`): with no catalogue each card
 * shows the placeholder and the footnote is left out.
 */
export function HomePricing({
    plans,
    footnote,
}: {
    plans: PlanTeaserView[];
    footnote: string | null;
}) {
    return (
        <Container
            as="section"
            id="pricing"
            aria-labelledby="pricing-title"
            className="grid scroll-mt-6 gap-[18px] pt-[110px]"
        >
            <h2
                id="pricing-title"
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                {home.pricingTitle}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
                {plans.map((teaser) => (
                    <PlanTeaserCard
                        key={teaser.plan}
                        teaser={teaser}
                        src="home-pricing"
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-mk-note text-muted-foreground">
                {footnote ? <span>{footnote}</span> : null}
                <Link
                    href="/pricing"
                    className="cursor-pointer rounded-sm font-semibold text-brand-700 no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                >
                    {home.pricingCompare}
                    <Arrow />
                </Link>
            </div>
        </Container>
    );
}
