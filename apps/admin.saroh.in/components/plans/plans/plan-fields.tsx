"use client";

import type { Catalog, Plan } from "@saroh/pricing-catalog";
import { regularYearlyPaise } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { useId } from "react";

import { planCurrencySign, planMoney } from "@/lib/plan-money";
import { PRICE_HINT, parseRupees, rupeesText } from "./catalog-edits";
import { FIELD, Field, NumberField } from "./fields";

/**
 * One plan's own fields, in the plan sheet (admin redesign U12, R22; the
 * Plans tab's "Plan by plan" before it): Name, the monthly price before
 * GST and when a new one reaches businesses, the line under the name, the
 * button, Highlight, and what it comes to a year when yearly billing is
 * on, with its yearly offer price (DEC-239). Retire is the sheet's own
 * block.
 */

export const SMALL_BUTTON =
    "h-8 rounded-[8px] border-border-strong px-3 text-[12.5px]";

export function PlanFields({
    plan,
    yearly,
    priceWas,
    disabled,
    errors,
    onChange,
    onFeature,
}: {
    plan: Plan;
    yearly: Catalog["yearly"];
    /** "was ₹111" when the draft changed the price. */
    priceWas: string | null;
    disabled: boolean;
    errors: {
        name?: string;
        pricePaise?: string;
        yearlyOfferPaise?: string;
        cta?: string;
        tagline?: string;
        plans?: string;
    };
    onChange: (
        patch: Partial<
            Pick<
                Plan,
                "name" | "pricePaise" | "cta" | "tagline" | "yearlyOfferPaise"
            >
        >,
    ) => void;
    onFeature: () => void;
}) {
    const featureId = useId();
    const name = plan.name || "this plan";
    const yearlyOn = yearly.on && plan.pricePaise > 0;
    const regularYear = planMoney(regularYearlyPaise({ yearly }, plan));
    const yearlyLine = yearlyOn ? ` Yearly: ${regularYear} a year.` : "";
    return (
        <div className="grid gap-4">
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
                label="Price a month, before GST"
                prefix={planCurrencySign()}
                value={plan.pricePaise}
                format={rupeesText}
                parse={(t) => parseRupees(t) ?? undefined}
                onCommit={(pricePaise) => onChange({ pricePaise })}
                hint={PRICE_HINT}
                error={errors.pricePaise}
                note={
                    `A new price reaches businesses already on ${name} only at their renewal, after you publish.` +
                    (priceWas
                        ? ` Live: ${priceWas.replace(/^was /, "")}.`
                        : "") +
                    yearlyLine
                }
                inputMode="decimal"
                disabled={disabled}
            />
            {yearlyOn ? (
                <NumberField<number | null>
                    key={`${plan.id}-year`}
                    label="Yearly offer price, before GST"
                    prefix={planCurrencySign()}
                    value={plan.yearlyOfferPaise ?? null}
                    format={(v) => (v === null ? "" : rupeesText(v))}
                    parse={(t) => {
                        if (t.trim() === "") return null;
                        const v = parseRupees(t);
                        // Nothing or zero is refused: blank is no offer.
                        if (!v) return undefined;
                        return v;
                    }}
                    onCommit={(v) =>
                        onChange({ yearlyOfferPaise: v ?? undefined })
                    }
                    hint="Enter rupees above 0, like 4999, or leave it blank for no offer"
                    error={errors.yearlyOfferPaise}
                    note={`What a yearly buyer pays. The pricing page shows it with the regular ${regularYear} a year struck through. Leave it blank to charge the regular price.`}
                    inputMode="decimal"
                    disabled={disabled}
                />
            ) : null}
            <Field label="One line under the name" error={errors.tagline}>
                {(a) => (
                    <input
                        {...a}
                        value={plan.tagline}
                        disabled={disabled}
                        onChange={(e) => onChange({ tagline: e.target.value })}
                        className={FIELD}
                    />
                )}
            </Field>
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
            <div className="flex items-center gap-2.5">
                <Checkbox
                    id={featureId}
                    checked={plan.featured}
                    disabled={disabled}
                    onCheckedChange={() => onFeature()}
                />
                <label
                    htmlFor={featureId}
                    className="cursor-pointer text-[13px] text-foreground"
                >
                    Highlight this plan on the pricing page
                </label>
            </div>
            {errors.plans && (
                <p role="alert" className="text-[12px] text-destructive">
                    {errors.plans}
                </p>
            )}
        </div>
    );
}
