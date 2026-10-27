"use client";

import Link from "next/link";
import { useState } from "react";

import { track } from "@/lib/analytics";
import type { PricingPageModel, PricingView } from "@/lib/pricing-model";
import { viewKey } from "@/lib/pricing-model";
import { ring } from "@/lib/ring";

import { Arrow } from "../shared/links/arrow";
import { BillingToggle } from "./billing-toggle";
import { GstToggle } from "./gst-toggle";
import { PlanCards } from "./plan-cards";

export interface PricingSwitches {
    yearly: boolean;
    setYearly: (v: boolean) => void;
    withGst: boolean;
    setWithGst: (v: boolean) => void;
    view: PricingView;
}

/**
 * The two switches (yearly, with GST) and the view they pick from the
 * model the server worked out (`pricingPageModel`). `/pricing` holds them
 * itself so its tables follow the same switches as its cards.
 */
export function usePricingSwitches(model: PricingPageModel): PricingSwitches {
    const [yearly, setYearly] = useState(false);
    const [withGst, setWithGst] = useState(model.gst.initial);
    return {
        yearly,
        setYearly,
        withGst,
        setWithGst,
        view: model.views[viewKey(yearly && !!model.yearly, withGst)],
    };
}

/**
 * The plan cards as the Pricing page draws them, with its switches and
 * footnote: ONE component wherever plans show (the Pricing page, Home, a
 * /solutions/ page, a /for/ page), so they never drift. `compare` adds
 * "Compare every plan" for pages without the comparison tables; `src` says
 * where a sign-up came from. Sends `pricing_toggle` when a switch flips.
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
    const { yearly, setYearly, withGst, setWithGst, view } = switches ?? own;
    const showControls = !!model.yearly || model.gst.toggle;

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
                                track("pricing_toggle", {
                                    control: "yearly",
                                    value: v,
                                });
                            }}
                        />
                    ) : null}
                    {model.gst.toggle ? (
                        <GstToggle
                            checked={withGst}
                            onChange={(v) => {
                                setWithGst(v);
                                track("pricing_toggle", {
                                    control: "gst",
                                    value: v,
                                });
                            }}
                        />
                    ) : null}
                </div>
            ) : null}
            <PlanCards plans={view.plans} src={src} />
            {view.footnote || compare ? (
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-mk-note text-muted-foreground">
                    {view.footnote ? (
                        <span aria-live="polite">{view.footnote}</span>
                    ) : null}
                    {compare ? (
                        <Link
                            href="/pricing"
                            className={`cursor-pointer rounded-sm font-semibold text-brand-700 no-underline transition-colors duration-fast ease-out hover:text-foreground ${ring()}`}
                        >
                            Compare every plan
                            <Arrow />
                        </Link>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
