"use client";

import type { Plan } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useMemo } from "react";

import { useDraft } from "../draft-store";
import { priceWas } from "../grid/grid-model";
import { usePlans } from "../plans-context";
import { errorsByPath, toggleFeatured } from "../plans/catalog-edits";
import { PlanFields, SMALL_BUTTON } from "../plans/plan-fields";
import { CardPreview } from "./card-preview";
import { SheetFoot } from "./sheet-foot";
import { keepersLine, onPlanLine } from "./sheet-model";

/**
 * A plan's own sheet, from its pencil in the pricing table (admin redesign
 * U12, R22): its name, price (a new one reaches businesses already on it
 * at their renewal), the line under the name, the button and the
 * highlight, beside its card as the pricing page will draw it, which
 * follows every keystroke. Retire sits in its own block and says who keeps
 * the plan; a plan that was never published can be removed instead.
 *
 * It edits the shared draft like the table's cells, so it has no Save of
 * its own: every change autosaves, and a 409 or a failed save is the draft
 * bar's to say. Without `pricing:edit` it reads the same and nothing
 * changes.
 */
export function PlanSheet({
    planId,
    onClose,
    onRemove,
}: {
    planId: string;
    onClose: () => void;
    /** Shown only for a plan that was never published. */
    onRemove?: () => void;
}) {
    const { catalog, live, edit, check, canEdit } = useDraft();
    const { pricing } = usePlans();
    const errors = useMemo(() => errorsByPath(check.errors), [check.errors]);
    const index = catalog?.plans.findIndex((p) => p.id === planId) ?? -1;
    const plan = index >= 0 ? catalog?.plans[index] : undefined;
    if (!catalog || !plan) return null;

    const name = plan.name || "Unnamed plan";
    const count = pricing.plans.find((p) => p.planId === plan.id);
    const on = count?.businesses ?? 0;
    const at = (path: string) => errors.get(path);
    const change = (fn: (p: Plan) => void) =>
        edit((c) => {
            const p = c.plans.find((x) => x.id === plan.id);
            if (p) fn(p);
        });

    return (
        <Sheet
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]">
                <SheetHeader className="border-b border-border px-6 pb-3.5 pt-5">
                    <SheetTitle>Edit {name}</SheetTitle>
                    <SheetDescription>
                        {onPlanLine(count, name)}
                        {plan.featured
                            ? " · highlighted on the pricing page"
                            : ""}
                        {plan.retired ? " · retired in this draft" : ""}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-wrap items-start gap-6 overflow-y-auto px-6 py-5">
                    <div className="grid min-w-0 flex-[1_1_340px] gap-5">
                        <PlanFields
                            plan={plan}
                            yearly={catalog.yearly}
                            priceWas={priceWas(
                                live?.catalog ?? null,
                                catalog,
                                plan.id,
                            )}
                            disabled={!canEdit}
                            errors={{
                                name: at(`plans.${index}.name`),
                                pricePaise: at(`plans.${index}.pricePaise`),
                                cta: at(`plans.${index}.cta`),
                                tagline: at(`plans.${index}.tagline`),
                                plans: at("plans") ?? at(`plans.${index}.id`),
                            }}
                            onChange={(patch) =>
                                change((p) => Object.assign(p, patch))
                            }
                            onFeature={() =>
                                edit((c) => toggleFeatured(c, plan.id))
                            }
                        />

                        <section
                            aria-label={`Retire ${name}`}
                            className="grid gap-2 rounded-[12px] border border-destructive/40 p-3.5"
                        >
                            <h3 className="font-semibold">
                                {plan.retired
                                    ? `${name} is retired in this draft`
                                    : `Retire ${name}`}
                            </h3>
                            <p className="text-[13px] leading-[1.5] text-muted-foreground">
                                {plan.retired
                                    ? "It leaves the pricing page when the draft is published, and new businesses can't choose it."
                                    : "New businesses can't choose it once the draft is published."}{" "}
                                {keepersLine(on)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={cn(
                                        SMALL_BUTTON,
                                        !plan.retired &&
                                            "text-destructive hover:text-destructive",
                                    )}
                                    disabled={!canEdit}
                                    onClick={() =>
                                        change((p) => {
                                            p.retired = !p.retired;
                                        })
                                    }
                                >
                                    {plan.retired
                                        ? "Offer it again"
                                        : `Retire ${name}`}
                                </Button>
                                {canEdit && onRemove && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className={cn(
                                            SMALL_BUTTON,
                                            "text-destructive hover:text-destructive",
                                        )}
                                        onClick={onRemove}
                                    >
                                        Remove plan
                                    </Button>
                                )}
                            </div>
                            {canEdit && onRemove && (
                                <p className="text-[12px] text-muted-foreground">
                                    It has never been published, so it can be
                                    removed from the draft instead.
                                </p>
                            )}
                        </section>
                    </div>
                    <CardPreview
                        catalog={catalog}
                        planId={plan.id}
                        className="min-w-0 flex-[0_1_300px] md:sticky md:top-0"
                    />
                </div>

                <SheetFoot canEdit={canEdit} />
            </SheetContent>
        </Sheet>
    );
}
