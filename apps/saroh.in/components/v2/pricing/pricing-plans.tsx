"use client";

import { useState } from "react";

import { track } from "@/lib/analytics";
import type { PricingPageModel } from "@/lib/pricing-model";
import { viewKey } from "@/lib/pricing-model";

import { Container } from "../container";
import { Addons } from "./addons";
import { BillingToggle } from "./billing-toggle";
import { CompareTable } from "./compare-table";
import { GstToggle } from "./gst-toggle";
import { PlanCards } from "./plan-cards";

/**
 * Everything on the pricing page the two switches change: the plan cards,
 * the footnote, the add-ons and the comparison table's prices. The server
 * worked out every combination (`pricingPageModel`); this only picks one,
 * and sends `pricing_toggle` when the visitor flips a switch.
 */
export function PricingPlans({ model }: { model: PricingPageModel }) {
    const [yearly, setYearly] = useState(false);
    const [withGst, setWithGst] = useState(model.gst.initial);
    const view = model.views[viewKey(yearly && !!model.yearly, withGst)];
    const showControls = !!model.yearly || model.gst.toggle;

    return (
        <>
            <Container
                as="section"
                aria-labelledby="plans-title"
                className="grid gap-3.5 pt-14"
            >
                {/* For the outline only: the cards' names are h3s under it. */}
                <h2 id="plans-title" className="sr-only">
                    Plans
                </h2>
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
                <PlanCards plans={view.plans} />
                {view.footnote ? (
                    <div
                        aria-live="polite"
                        className="text-mk-note text-muted-foreground"
                    >
                        {view.footnote}
                    </div>
                ) : null}
            </Container>
            <Addons addons={view.addons} />
            <CompareTable
                plans={view.plans}
                rows={model.rows}
                placeholder={model.placeholder}
            />
        </>
    );
}
