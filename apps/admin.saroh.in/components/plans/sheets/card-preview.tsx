"use client";

import type { Catalog } from "@saroh/pricing-catalog";
import { cardLines, formatInr } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";

/**
 * A plan's card as the pricing page draws it, from the draft (admin
 * redesign U12, R22): name and the highlight, the monthly price before GST,
 * the line under the name, the button, then what the plan includes, each
 * line a feature's "Line on the plan card" (the catalogue's `cardLines`, so
 * a later plan lists only what it adds). It reads the draft as it is typed,
 * so every keystroke in the plan or feature sheet shows here at once.
 */
export function CardPreview({
    catalog,
    planId,
    className,
}: {
    catalog: Catalog;
    planId: string;
    className?: string;
}) {
    const plan = catalog.plans.find((p) => p.id === planId);
    if (!plan) return null;
    const paid = plan.pricePaise > 0;
    const { lead, lines } = cardLines(catalog, plan.id);
    const name = plan.name || "Unnamed plan";
    return (
        <section
            aria-label={`Preview of ${name} on the pricing page`}
            className={cn("grid content-start gap-2.5", className)}
        >
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Preview on the pricing page
            </h3>
            <div
                data-card={plan.id}
                className={cn(
                    "grid gap-2.5 rounded-[16px] border bg-background p-5",
                    plan.featured
                        ? "border-t-4 border-highlight"
                        : "border-border-strong",
                    plan.retired && "opacity-60",
                )}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-display text-[20px] font-semibold">
                        {name}
                    </strong>
                    {plan.featured && (
                        <span className="rounded-full bg-highlight-subtle px-2 py-0.5 text-[11px] font-semibold text-highlight-subtle-foreground">
                            Highlighted
                        </span>
                    )}
                </div>
                <p className="font-display text-[26px] font-semibold tabular-nums">
                    {formatInr(plan.pricePaise)}
                    <span className="font-sans text-[13px] font-normal text-muted-foreground">
                        {paid ? " a month + GST" : " · Free for good"}
                    </span>
                </p>
                {plan.tagline && (
                    <p className="text-[13.5px] text-muted-foreground">
                        {plan.tagline}
                    </p>
                )}
                {plan.cta && (
                    <span className="flex h-10 items-center justify-center rounded-[9px] bg-foreground px-3 text-[13.5px] font-semibold text-background">
                        {plan.cta}
                    </span>
                )}
                <ul className="mt-1 grid gap-1.5 border-t border-border pt-3 text-[13px]">
                    {lead && <li className="font-semibold">{lead}</li>}
                    {lines.map((l) => (
                        <li key={l.t} className="flex gap-2">
                            <span
                                aria-hidden
                                className="font-bold text-highlight-subtle-foreground"
                            >
                                ✓
                            </span>
                            {l.t}
                        </li>
                    ))}
                    {!lead && lines.length === 0 && (
                        <li className="text-muted-foreground">
                            No lines yet. A feature&apos;s line on the plan card
                            shows here.
                        </li>
                    )}
                </ul>
            </div>
            <p className="text-[12px] leading-[1.45] text-muted-foreground">
                {plan.retired
                    ? "Retired: this card leaves the pricing page when the draft is published."
                    : "The card's lines come from each feature's line on the plan card."}
            </p>
        </section>
    );
}
