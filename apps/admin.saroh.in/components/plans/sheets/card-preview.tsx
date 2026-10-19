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
    live,
    className,
}: {
    catalog: Catalog;
    planId: string;
    /**
     * Live, to mark what the draft changed on the card (the docked preview,
     * U13); left out, nothing is marked.
     */
    live?: Catalog | null;
    className?: string;
}) {
    const plan = catalog.plans.find((p) => p.id === planId);
    if (!plan) return null;
    const paid = plan.pricePaise > 0;
    const { lead, lines } = cardLines(catalog, plan.id);
    const name = plan.name || "Unnamed plan";
    const was = changedOnCard(live ?? null, catalog, plan.id);
    const mark =
        "rounded-[4px] bg-highlight-subtle px-1 text-highlight-subtle-foreground";
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
                    <strong
                        className={cn(
                            "font-display text-[20px] font-semibold",
                            was.name && mark,
                        )}
                    >
                        {name}
                    </strong>
                    {plan.featured && (
                        <span className="rounded-full bg-highlight-subtle px-2 py-0.5 text-[11px] font-semibold text-highlight-subtle-foreground">
                            Highlighted
                        </span>
                    )}
                </div>
                <p
                    className={cn(
                        "font-display text-[26px] font-semibold tabular-nums",
                        was.price && mark,
                    )}
                >
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
                        <li
                            key={l.t}
                            data-changed={was.lines.has(l.t) || undefined}
                            className={cn(
                                "flex gap-2",
                                was.lines.has(l.t) && mark,
                            )}
                        >
                            <span
                                aria-hidden
                                className="font-bold text-highlight-subtle-foreground"
                            >
                                ✓
                            </span>
                            {l.t}
                            {was.lines.has(l.t) && (
                                <span className="sr-only"> (changed)</span>
                            )}
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
                    : was.name || was.price || was.lines.size > 0
                      ? "Marked parts changed in the draft."
                      : "The card's lines come from each feature's line on the plan card."}
            </p>
        </section>
    );
}

/** What on a plan's card differs from live: its name, price and lines. */
export function changedOnCard(
    live: Catalog | null,
    catalog: Catalog,
    planId: string,
): { name: boolean; price: boolean; lines: Set<string> } {
    const none = { name: false, price: false, lines: new Set<string>() };
    if (!live) return none;
    const was = live.plans.find((p) => p.id === planId);
    const now = catalog.plans.find((p) => p.id === planId);
    if (!now) return none;
    const nowLines = cardLines(catalog, planId).lines.map((l) => l.t);
    if (!was) return { name: true, price: true, lines: new Set(nowLines) };
    const before = new Set(cardLines(live, planId).lines.map((l) => l.t));
    return {
        name: was.name !== now.name,
        price: was.pricePaise !== now.pricePaise,
        lines: new Set(nowLines.filter((t) => !before.has(t))),
    };
}
