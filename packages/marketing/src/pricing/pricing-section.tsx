import type { ReactNode } from "react";

import { cn } from "../cn";
import { Section } from "../sections/section";

/**
 * A page's pricing section (Home's `#pricing`, a solution page's "Pricing
 * for shops"): its title, then the site's plan cards (`PricingCards`).
 * `className` carries the page's own top space (DEC-195, A9).
 */
export function PricingSection({
    id,
    className,
    title,
    children,
}: {
    /** Home's `pricing`, the nav's and the footer's anchor. */
    id?: string;
    className?: string;
    title: string;
    children: ReactNode;
}) {
    return (
        <Section
            id={id}
            titleId="pricing-title"
            title={title}
            className={cn("grid gap-[18px]", className)}
        >
            {children}
        </Section>
    );
}
