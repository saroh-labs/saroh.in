import type { Metadata } from "next";

import {
    PRICING_COPY,
    PricingPage,
} from "@/components/v2/pricing/pricing-page";
import { readLivePricing } from "@/lib/pricing";
import { placeholderPricingModel, pricingPageModel } from "@/lib/pricing-view";

/**
 * `/pricing` (plans catalogue U24): the Pricing design, drawn from the
 * published catalogue. Static, regenerated every five minutes and at once
 * when the API calls `/api/revalidate` after a publish (KTD-10). With no
 * catalogue to read, every price is the "Pricing announced at launch"
 * placeholder.
 */
export const revalidate = 300;

const DESCRIPTION =
    "Start free with your site and your first bookings. Move to Grow for orders, subscriptions and invoices, and to Pro for your own look and a bigger team.";

export const metadata: Metadata = {
    title: `Pricing — ${PRICING_COPY.title} · Saroh`,
    description: DESCRIPTION,
    alternates: { canonical: "/pricing" },
    openGraph: {
        type: "website",
        siteName: "Saroh",
        url: "/pricing",
        title: `Pricing — ${PRICING_COPY.title}`,
        description: DESCRIPTION,
    },
    twitter: {
        title: `Pricing — ${PRICING_COPY.title}`,
        description: DESCRIPTION,
    },
};

export default async function PricingRoute() {
    const catalog = await readLivePricing();
    const model = catalog
        ? pricingPageModel(catalog)
        : placeholderPricingModel();
    return <PricingPage model={model} />;
}
