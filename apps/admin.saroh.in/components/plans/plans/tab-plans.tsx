"use client";

import { useEffect, useState } from "react";

import { AddButton } from "../add-button";
import { useDraft } from "../draft-store";
import { PricingGrid } from "../grid/pricing-grid";
import type { PlansFocus } from "../plans-nav";
import { usePlansNav } from "../plans-nav";
import { FeatureSheet } from "../sheets/feature-sheet";
import { PlanSheet } from "../sheets/plan-sheet";
import { useFlash } from "../toast";
import { addPlan } from "./catalog-edits";
import { isUnpublishedPlan, removePlan, restorePlan } from "./structure-edits";

/**
 * The Plans tab (admin redesign U11, R20; U12, R21, R22): the pricing
 * table, edited in its cells (`PricingGrid`), and the two sheets that edit
 * what a cell doesn't:
 *
 * - a feature's name opens the feature sheet, that feature on every plan
 *   at once: how it is counted, soft or hard, each plan's limit and words,
 *   Locked or Hidden, and who it touches;
 * - a plan's pencil opens the plan sheet: its name, price, line, button
 *   and highlight beside a live card, Retire, and Remove for a plan that
 *   was never published (with Undo).
 *
 * Add plan (the table's toolbar) adds one and opens its sheet. Opened from
 * the Modules matrix on a plan's cell, the tab lands with that feature's
 * sheet open on that plan's line.
 *
 * Everything is drawn from the shared draft (`useDraft().catalog`) and
 * changed only through `edit`, so the sheets autosave like the cells and
 * have no Save of their own.
 */

type Open =
    | { kind: "feature"; moduleId: string; planId: string | null }
    | { kind: "plan"; planId: string };

function fromFocus(focus: PlansFocus | null): Open | null {
    if (focus?.moduleId) {
        return {
            kind: "feature",
            moduleId: focus.moduleId,
            planId: focus.planId ?? null,
        };
    }
    if (focus?.planId) return { kind: "plan", planId: focus.planId };
    return null;
}

export function TabPlans() {
    const { catalog, live, edit, canEdit } = useDraft();
    const { focus, clearFocus } = usePlansNav();
    const flash = useFlash();
    const liveCatalog = live?.catalog ?? null;

    const [open, setOpen] = useState<Open | null>(() => fromFocus(focus));

    // Opened on a plan and a row (the Modules matrix): take it while
    // rendering (the first render already has), then hand it back.
    const [taken, setTaken] = useState(focus);
    if (focus && focus !== taken) {
        setTaken(focus);
        setOpen(fromFocus(focus));
    }
    useEffect(() => {
        if (focus) clearFocus();
    }, [focus, clearFocus]);

    if (!catalog) return null;
    const close = () => setOpen(null);

    const removable = (planId: string) =>
        canEdit &&
        isUnpublishedPlan(liveCatalog, planId) &&
        catalog.plans.length > 1;

    const remove = (planId: string) => {
        const plan = catalog.plans.find((p) => p.id === planId);
        if (!plan) return;
        const name = plan.name || "Unnamed plan";
        const taken: { r: ReturnType<typeof removePlan> } = { r: null };
        edit((c) => {
            taken.r = removePlan(c, liveCatalog, planId);
        });
        const removed = taken.r;
        if (!removed) return;
        setOpen(null);
        flash(`${name} removed`, {
            label: "Undo",
            onClick: () => {
                edit((c) => restorePlan(c, removed));
                setOpen({ kind: "plan", planId: removed.plan.id });
            },
        });
    };

    return (
        <div className="grid min-w-0 gap-4">
            <PricingGrid
                catalog={catalog}
                onPlanSettings={(planId) => setOpen({ kind: "plan", planId })}
                onFeature={(moduleId) =>
                    setOpen({ kind: "feature", moduleId, planId: null })
                }
                actions={
                    canEdit ? (
                        <AddButton
                            onClick={() => {
                                const made: { id: string | null } = {
                                    id: null,
                                };
                                edit((c) => {
                                    made.id = addPlan(c);
                                });
                                const id = made.id;
                                if (id) setOpen({ kind: "plan", planId: id });
                            }}
                        >
                            Add plan
                        </AddButton>
                    ) : null
                }
            />
            {open?.kind === "plan" && (
                <PlanSheet
                    key={open.planId}
                    planId={open.planId}
                    onClose={close}
                    onRemove={
                        removable(open.planId)
                            ? () => remove(open.planId)
                            : undefined
                    }
                />
            )}
            {open?.kind === "feature" && (
                <FeatureSheet
                    key={open.moduleId}
                    moduleId={open.moduleId}
                    focusPlanId={open.planId}
                    onClose={close}
                />
            )}
        </div>
    );
}
