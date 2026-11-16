"use client";

import { ButtonLink } from "@saroh/marketing/button";
import { Pill } from "@saroh/marketing/pill";
import { PricingCards } from "@saroh/marketing/pricing-cards";
import type { PricingPageModel } from "@saroh/marketing/pricing-model";
import { PricingPlans } from "@saroh/marketing/pricing-plans";
import { usePricingSwitches } from "@saroh/marketing/use-pricing-switches";

import { TellMeWhen } from "@/components/pricing/tell-me-when";
import { PRICING } from "@/content/pricing";
import { signupHref } from "@/site.config";

/** The shared plan cards. Free starts; a paid plan isn't available yet, and offers Tell me when. */
export function Plans({
    model,
    src = "pricing",
    compare,
}: {
    model: PricingPageModel;
    /** The page that brought them, on the sign-up link. */
    src?: string;
    compare?: { href: string; label: string };
}) {
    const switches = usePricingSwitches(model);
    return (
        <PricingCards
            model={model}
            switches={switches}
            ownHeight
            compare={compare}
            cta={(plan, look) =>
                plan.cta.paid ? (
                    <div className="grid justify-items-start gap-3">
                        <Pill
                            tone="outline"
                            className="justify-self-start text-muted-foreground"
                        >
                            {PRICING.notYet}
                        </Pill>
                        <TellMeWhen plan={plan.id} look={look} />
                    </div>
                ) : (
                    <ButtonLink
                        {...look}
                        href={signupHref(src)}
                        data-cta="plan-free"
                    >
                        Start free
                    </ButtonLink>
                )
            }
        />
    );
}

/**
 * The plan cards, then every plan's details as saroh.in shows them: the
 * comparison table and each plan's usage (owner, 16 Nov 2026). No add-ons.
 */
export function PricingTables({ model }: { model: PricingPageModel }) {
    const switches = usePricingSwitches(model);
    return (
        <PricingPlans
            model={model}
            switches={switches}
            cards={<Plans model={model} />}
            usageTitle={PRICING.usageTitle}
            usageLead={PRICING.usageLead}
            placeholderNote={PRICING.priceNote}
        />
    );
}
