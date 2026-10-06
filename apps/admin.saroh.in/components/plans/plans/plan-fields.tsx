"use client";

import type { Catalog, Plan } from "@saroh/pricing-catalog";
import { formatInr, yearlyPaise } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";

import { PRICE_HINT, parseRupees, rupeesText } from "./catalog-edits";
import { FIELD, Field, NumberField } from "./fields";

/**
 * One plan's own fields in the Plans tab (plans catalogue U7): Name, the
 * monthly price before GST, the button, the line under the name, Highlight
 * and Retire, and what it comes to a year when yearly billing is on.
 */

export const SMALL_BUTTON =
    "h-8 rounded-[8px] border-border-strong px-3 text-[12.5px]";

export function PlanFields({
    plan,
    yearly,
    disabled,
    errors,
    onChange,
    onFeature,
    onRetire,
}: {
    plan: Plan;
    yearly: Catalog["yearly"];
    disabled: boolean;
    errors: {
        name?: string;
        pricePaise?: string;
        cta?: string;
        tagline?: string;
        plans?: string;
    };
    onChange: (
        patch: Partial<Pick<Plan, "name" | "pricePaise" | "cta" | "tagline">>,
    ) => void;
    onFeature: () => void;
    onRetire: () => void;
}) {
    return (
        <>
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
                <Field label="Name" error={errors.name}>
                    {(a) => (
                        <input
                            {...a}
                            value={plan.name}
                            disabled={disabled}
                            onChange={(e) => onChange({ name: e.target.value })}
                            className={FIELD}
                        />
                    )}
                </Field>
                <NumberField
                    // A new plan is a new field: what was typed for the last
                    // plan never carries over.
                    key={plan.id}
                    label="Price a month, before GST (₹)"
                    value={plan.pricePaise}
                    format={rupeesText}
                    parse={(t) => parseRupees(t) ?? undefined}
                    onCommit={(pricePaise) => onChange({ pricePaise })}
                    hint={PRICE_HINT}
                    error={errors.pricePaise}
                    inputMode="decimal"
                    disabled={disabled}
                />
                <Field label="Button" error={errors.cta}>
                    {(a) => (
                        <input
                            {...a}
                            value={plan.cta}
                            disabled={disabled}
                            onChange={(e) => onChange({ cta: e.target.value })}
                            className={FIELD}
                        />
                    )}
                </Field>
                <Field
                    label="One line under the name"
                    error={errors.tagline}
                    className="col-span-full"
                >
                    {(a) => (
                        <input
                            {...a}
                            value={plan.tagline}
                            disabled={disabled}
                            onChange={(e) =>
                                onChange({ tagline: e.target.value })
                            }
                            className={FIELD}
                        />
                    )}
                </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    aria-pressed={plan.featured}
                    className={SMALL_BUTTON}
                    disabled={disabled}
                    onClick={onFeature}
                >
                    {plan.featured ? "Remove highlight" : "Highlight this card"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                        SMALL_BUTTON,
                        !plan.retired &&
                            "text-destructive hover:text-destructive",
                    )}
                    disabled={disabled}
                    onClick={onRetire}
                >
                    {plan.retired ? "Offer again" : "Retire plan"}
                </Button>
                {yearly.on && plan.pricePaise > 0 && (
                    <span className="text-[12px] text-muted-foreground">
                        Yearly:{" "}
                        {formatInr(yearlyPaise(plan.pricePaise, yearly.paid))} a
                        year
                    </span>
                )}
                {errors.plans && (
                    <p role="alert" className="text-[12px] text-destructive">
                        {errors.plans}
                    </p>
                )}
            </div>
        </>
    );
}
