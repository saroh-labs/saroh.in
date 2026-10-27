"use client";

import type { PricingPageModel } from "@/lib/pricing-model";

import { Container } from "../container";
import { CompareTable } from "./compare-table";
import { PricingCards, usePricingSwitches } from "./pricing-cards";
import { UsageTable } from "./usage-table";

/**
 * Everything on the pricing page the two switches change: the shared plan
 * cards (`PricingCards`, the same on every page), then the usage table and
 * the comparison table's prices, following the same switches.
 */
export function PricingPlans({ model }: { model: PricingPageModel }) {
    const switches = usePricingSwitches(model);

    return (
        <>
            <Container
                as="section"
                aria-labelledby="plans-title"
                className="grid gap-3.5 pt-14"
            >
                {/* For the outline only: the cards' names are h3s under it. */}
                <h2 id="plans-title" className="sr-only">
                    Plans
                </h2>
                <PricingCards model={model} switches={switches} />
            </Container>
            <UsageTable
                plans={switches.view.plans}
                usage={switches.view.usage}
            />
            <CompareTable
                plans={switches.view.plans}
                rows={model.rows}
                placeholder={model.placeholder}
            />
        </>
    );
}
