"use client";

import { PricingCards as Cards } from "@saroh/marketing/pricing-cards";
import type {
    PricingPageModel,
    PricingSwitches,
} from "@saroh/marketing/pricing-model";
import { usePricingSwitches } from "@saroh/marketing/use-pricing-switches";

import { track } from "@/lib/analytics";

import { CtaLink } from "../shared/buttons/cta-link";
import { GstToggle } from "./gst-toggle";

/**
 * The plan cards as this site draws them: its start button (`CtaLink`, the one
 * CTA builder, KTD-16), its GST box and its `pricing_toggle` events. ONE
 * component wherever plans show (the Pricing page, Home, a /solutions/ page, a
 * /for/ page), so they never drift. `compare` adds "Compare every plan" for
 * pages without the comparison tables; `src` says where a sign-up came from.
 */
export function PricingCards({
    model,
    switches,
    src = "pricing-plans",
    compare = false,
}: {
    model: PricingPageModel;
    /** The page's own switches, when something else follows them too. */
    switches?: PricingSwitches;
    src?: string;
    compare?: boolean;
}) {
    const own = usePricingSwitches(model);
    return (
        <Cards
            model={model}
            switches={switches ?? own}
            compare={
                compare
                    ? { href: "/pricing", label: "Compare every plan" }
                    : undefined
            }
            cta={(p, look) => (
                <CtaLink
                    src={src}
                    plan={p.cta.plan}
                    planName={p.cta.planName}
                    paid={p.cta.paid}
                    trialDays={p.cta.trialDays}
                    cycle={p.cta.cycle}
                    {...look}
                />
            )}
            onYearlyChange={(v) =>
                track("pricing_toggle", { control: "yearly", value: v })
            }
            taxToggle={(checked, onChange) => (
                <GstToggle
                    checked={checked}
                    onChange={(v) => {
                        onChange(v);
                        track("pricing_toggle", { control: "gst", value: v });
                    }}
                />
            )}
        />
    );
}
