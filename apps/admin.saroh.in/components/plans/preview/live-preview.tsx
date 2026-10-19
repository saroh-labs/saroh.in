"use client";

import { offeredPlans } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import { useDraft } from "../draft-store";
import { CardPreview } from "../sheets/card-preview";
import { ChangeList } from "./change-list";
import { usePreview } from "./preview-state";

/**
 * The docked live preview beside the pricing table (admin redesign U13,
 * R18, R24): one plan's card as the pricing page draws it, from the draft
 * as it is typed, with what the draft changed on it marked; a choice of
 * plan; and "Changes in this draft" under it. "Hide preview" in the header
 * folds it away, and that is remembered (`usePreview`).
 */
export function LivePreview() {
    const { catalog, live } = useDraft();
    const { shown } = usePreview();
    const plans = catalog ? offeredPlans(catalog) : [];
    const featured = plans.find((p) => p.featured) ?? plans.at(0);
    const [picked, setPicked] = useState<string | null>(null);

    if (!shown || !catalog || plans.length === 0) return null;
    const planId =
        plans.find((p) => p.id === picked)?.id ?? featured?.id ?? null;
    if (!planId) return null;
    const liveCatalog = live?.catalog ?? null;

    return (
        <aside
            aria-label="Live preview"
            className="grid content-start gap-3 rounded-[14px] border border-border bg-card p-4 xl:sticky xl:top-4"
        >
            <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="font-display text-[15px] font-semibold">
                    Live preview
                </h2>
                <span className="text-[12px] text-muted-foreground">
                    updates as you type
                </span>
            </div>
            {plans.length > 1 && (
                <div
                    role="group"
                    aria-label="Plan to preview"
                    className="flex flex-wrap gap-1 rounded-[10px] bg-secondary p-1"
                >
                    {plans.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            aria-pressed={p.id === planId}
                            onClick={() => setPicked(p.id)}
                            className={cn(
                                "min-h-[30px] cursor-pointer rounded-[8px] px-3 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                p.id === planId
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {p.name || "Unnamed plan"}
                        </button>
                    ))}
                </div>
            )}
            <CardPreview catalog={catalog} planId={planId} live={liveCatalog} />
            <ChangeList variant="docked" />
        </aside>
    );
}
