import type { PricingPageModel } from "@saroh/marketing/pricing-model";
import { PricingSection as Section } from "@saroh/marketing/pricing-section";

import { PricingCards } from "./pricing-cards";

/**
 * A page's pricing section (Home's `#pricing`, a solution page's "Pricing
 * for shops"): its title, then the Pricing page's own plan cards
 * (`PricingCards`) and "Compare every plan". With no catalogue the model is
 * the placeholder one, as on /pricing. `className` carries the page's own
 * top space (DEC-195, A9).
 */
export function PricingSection({
    id,
    className,
    title,
    model,
    src,
}: {
    /** Home's `pricing`, the nav's and the footer's anchor. */
    id?: string;
    className?: string;
    title: string;
    model: PricingPageModel;
    /** The plan buttons' analytics source, e.g. `home-pricing`. */
    src: string;
}) {
    return (
        <Section id={id} className={className} title={title}>
            <PricingCards model={model} src={src} compare />
        </Section>
    );
}
