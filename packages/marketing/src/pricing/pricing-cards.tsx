"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Arrow } from "../links/arrow";
import { textLinkClasses } from "../links/text-link";
import { BillingToggle } from "./billing-toggle";
import type { PlanCta } from "./plan-cards";
import { PlanCards } from "./plan-cards";
import type { PricingPageModel, PricingSwitches } from "./pricing-model";

/**
 * The plan cards as a pricing page draws them, with its switches and
 * footnote: ONE component wherever plans show, so they never drift. Each site
 * brings its own start button (`cta`) and tax toggle (`taxToggle`, none where
 * it has no such switch); `compare` adds "Compare every plan" for pages without
 * the comparison tables.
 */
export function PricingCards({
    model,
    switches,
    cta,
    taxToggle,
    onYearlyChange,
    compare,
}: {
    model: PricingPageModel;
    switches: PricingSwitches;
    cta: PlanCta;
    /** The site's tax switch; drawn when the model has one. */
    taxToggle?: (checked: boolean, onChange: (v: boolean) => void) => ReactNode;
    /** Told when the visitor flips Monthly / Yearly. */
    onYearlyChange?: (yearly: boolean) => void;
    compare?: { href: string; label: string };
}) {
    const { yearly, setYearly, withTax, setWithTax, view } = switches;
    const tax = model.tax.toggle ? taxToggle?.(withTax, setWithTax) : null;
    const showControls = !!model.yearly || !!tax;

    return (
        <div className="grid gap-3.5">
            {showControls ? (
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
                    {model.yearly ? (
                        <BillingToggle
                            yearly={yearly}
                            freeMonths={model.yearly.freeMonths}
                            onChange={(v) => {
                                if (v === yearly) return;
                                setYearly(v);
                                onYearlyChange?.(v);
                            }}
                        />
                    ) : null}
                    {tax}
                </div>
            ) : null}
            <PlanCards plans={view.plans} cta={cta} />
            {view.footnote || compare ? (
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-mk-note text-muted-foreground">
                    {view.footnote ? (
                        <span aria-live="polite">{view.footnote}</span>
                    ) : null}
                    {compare ? (
                        <Link
                            href={compare.href}
                            className={textLinkClasses({
                                className: "font-semibold",
                            })}
                        >
                            {compare.label}
                            <Arrow />
                        </Link>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
