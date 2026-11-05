import { PricingSection } from "@saroh/marketing/pricing-section";
import type { Catalog } from "@saroh/pricing-catalog";

import { Plans } from "@/components/pricing/plans";
import { home } from "@/content/home";
import { freeCardModel } from "@/lib/plans";

/**
 * Home's and a solution page's pricing section, drawn as saroh.in's: Free's card,
 * with its limits when the catalogue was read at build, and a link to /pricing.
 */
export function PricingTeaser({
    id,
    title,
    className,
    catalog,
    src,
}: {
    id?: string;
    title: string;
    className?: string;
    catalog: Catalog | null;
    /** The page that brought them, on the sign-up link. */
    src: string;
}) {
    return (
        <PricingSection id={id} title={title} className={className}>
            {/* One card would stretch across the page. */}
            <div className="max-w-[420px]">
                <Plans
                    model={freeCardModel(catalog)}
                    src={src}
                    compare={{ href: "/pricing", label: home.pricingCompare }}
                />
            </div>
        </PricingSection>
    );
}
