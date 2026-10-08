import type { Metadata } from "next";

import { JsonLd } from "@/components/v2/json-ld";
import { PricingPage } from "@/components/v2/pricing/pricing-page";
import { PRICING_COPY, PRICING_DESCRIPTION } from "@/content/pricing";
import { readLivePricing } from "@/lib/pricing";
import { placeholderPricingModel, pricingPageModel } from "@/lib/pricing-view";
import { pageMetadata } from "@/lib/seo";
import { softwareApplicationLd } from "@/lib/structured-data";

/**
 * `/pricing` (plans catalogue U24): the Pricing design, drawn from the
 * published catalogue. Static, built from the catalogue when the site is
 * built; a publish starts a build (KTD-10). With no catalogue to read, every
 * price is the "Pricing announced at launch" placeholder.
 */

export const metadata: Metadata = pageMetadata({
    title: `Pricing — ${PRICING_COPY.title} · Saroh`,
    socialTitle: `Pricing — ${PRICING_COPY.title}`,
    description: PRICING_DESCRIPTION,
    path: "/pricing",
});

export default async function PricingRoute() {
    const catalog = await readLivePricing();
    const model = catalog
        ? pricingPageModel(catalog)
        : placeholderPricingModel();
    return (
        <>
            <JsonLd
                data={softwareApplicationLd(catalog, PRICING_DESCRIPTION)}
            />
            <PricingPage model={model} />
        </>
    );
}
