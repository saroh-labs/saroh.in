import type { ReactNode } from "react";

import { Container } from "../layout/container";
import { CompareTable } from "./compare-table";
import type { PricingPageModel, PricingSwitches } from "./pricing-model";
import { UsageTable } from "./usage-table";

/**
 * Everything on a pricing page the two switches change: the site's plan cards
 * (`cards`, `PricingCards` with its button and toggle), then the usage table
 * and the comparison table's prices, following the same switches.
 */
export function PricingPlans({
    model,
    switches,
    cards,
    usageTitle,
    usageLead,
    placeholderNote,
}: {
    model: PricingPageModel;
    switches: PricingSwitches;
    cards: ReactNode;
    usageTitle: string;
    usageLead: string;
    /** What a screen reader hears in a table cell with no catalogue. */
    placeholderNote: string;
}) {
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
                {cards}
            </Container>
            <UsageTable
                plans={switches.view.plans}
                usage={switches.view.usage}
                title={usageTitle}
                lead={usageLead}
            />
            <CompareTable
                plans={switches.view.plans}
                rows={model.rows}
                placeholder={model.placeholder}
                placeholderNote={placeholderNote}
            />
        </>
    );
}
