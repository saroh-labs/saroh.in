import type { ReactNode } from "react";

import { Container } from "../layout/container";
import { CompareTable } from "./compare-table";
import type { PricingPageModel, PricingSwitches } from "./pricing-model";
import { UsageTable } from "./usage-table";

/**
 * Everything on a pricing page the two switches change: the site's plan cards
 * (`cards`, `PricingCards` with its button and toggle), then the comparison
 * table and the usage table, following the same switches.
 */
export function PricingPlans({
    model,
    switches,
    cards,
    usageTitle,
    usageLead,
    placeholderNote,
    talk,
    faq,
}: {
    model: PricingPageModel;
    switches: PricingSwitches;
    cards: ReactNode;
    usageTitle: string;
    usageLead: string;
    /** What a screen reader hears in a table cell with no catalogue. */
    placeholderNote: string;
    /** Under the cards: the site's "Talk to us". */
    talk?: ReactNode;
    /** Last: the site's questions about paying. */
    faq?: ReactNode;
}) {
    return (
        <>
            <Container
                as="section"
                aria-labelledby="plans-title"
                className="grid gap-4"
            >
                {/* For the outline only: the cards' names are h3s under it. */}
                <h2 id="plans-title" className="sr-only">
                    Plans
                </h2>
                {cards}
                {talk}
            </Container>
            {/* Compare first, then usage (owner, 6 Nov 2026). */}
            <CompareTable
                plans={switches.view.plans}
                rows={model.rows}
                placeholder={model.placeholder}
                placeholderNote={placeholderNote}
            />
            <UsageTable
                plans={switches.view.plans}
                usage={switches.view.usage}
                title={usageTitle}
                lead={usageLead}
            />
            {faq}
        </>
    );
}
