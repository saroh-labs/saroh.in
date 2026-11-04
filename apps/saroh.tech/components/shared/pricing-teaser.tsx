import { PricingSection } from "@saroh/marketing/pricing-section";
import { TextLink } from "@saroh/marketing/text-link";

import { FREE_PLAN_LINE, home } from "@/content/home";

/**
 * Home's and a solution page's pricing section until there are plans to show
 * here: the free-to-start line and a link, no amounts (plan U7).
 */
export function PricingTeaser({
    id,
    title,
    className,
}: {
    id?: string;
    title: string;
    className?: string;
}) {
    return (
        <PricingSection id={id} title={title} className={className}>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <p className="m-0 text-mk-body text-mk-copy">
                    {FREE_PLAN_LINE.fallback}
                </p>
                <TextLink
                    href="/pricing"
                    arrow
                    className="text-[15px] font-semibold"
                >
                    {home.pricingCompare}
                </TextLink>
            </div>
        </PricingSection>
    );
}
