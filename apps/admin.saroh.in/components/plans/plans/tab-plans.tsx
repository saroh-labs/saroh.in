"use client";

import type { Catalog } from "@saroh/pricing-catalog";
import { cellOf, formatInr } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import { AddButton } from "../add-button";
import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { usePlansNav } from "../plans-nav";
import { useFlash } from "../toast";
import {
    addPlan,
    cellChanged,
    defaultPlanId,
    errorsByPath,
    excludedCell,
    groupModules,
    includedCell,
    liveCellOf,
    patchIncluded,
    planChanged,
    setCell,
    toggleFeatured,
    usageLine,
} from "./catalog-edits";
import { ModuleRow } from "./module-row";
import { PlanFields } from "./plan-fields";
import { isUnpublishedPlan, removePlan, restorePlan } from "./structure-edits";

/**
 * The Plans tab: "Plan by plan" (plans catalogue U7, the design's plan
 * editor). Pick a plan from its chips, or add one (Add plan, top right; a
 * plan that was never published can be removed again, with Undo); change
 * its own fields;
 * then go down the modules, group by group, ticking what the plan includes
 * and saying how each looks on the pricing page and in the dashboard.
 *
 * Everything is drawn from the shared draft (`useDraft().catalog`) and
 * changed only through `edit`; a validation message from the catalogue's
 * rules sits beside the field it is about. Opened from the Modules matrix,
 * it lands on that plan with that module's row in view and focused.
 */
export function TabPlans() {
    const { catalog, live, edit, check, canEdit } = useDraft();
    const { pricing } = usePlans();
    const { focus, clearFocus } = usePlansNav();
    const flash = useFlash();
    const liveCatalog = live?.catalog ?? null;

    const [planId, setPlanId] = useState<string | null>(
        () => focus?.planId ?? (catalog ? defaultPlanId(catalog) : null),
    );
    const [focusModule, setFocusModule] = useState<string | null>(
        () => focus?.moduleId ?? null,
    );
    const ticks = useRef(new Map<string, HTMLButtonElement | null>());

    // Opened on a plan and a row (the Modules matrix): take it while
    // rendering (the first render already has), then hand it back.
    const [taken, setTaken] = useState(focus);
    if (focus && focus !== taken) {
        setTaken(focus);
        if (focus.planId) setPlanId(focus.planId);
        setFocusModule(focus.moduleId ?? null);
    }
    useEffect(() => {
        if (focus) clearFocus();
    }, [focus, clearFocus]);

    // Bring the focused row into view and put the keyboard on its tick.
    useEffect(() => {
        if (!focusModule) return;
        const el = ticks.current.get(focusModule);
        if (!el) return;
        el.scrollIntoView({ block: "center" });
        el.focus({ preventScroll: true });
    }, [focusModule, planId]);

    const errors = useMemo(() => errorsByPath(check.errors), [check.errors]);

    if (!catalog) return null;
    const plan =
        catalog.plans.find((p) => p.id === planId) ??
        catalog.plans.find((p) => p.id === defaultPlanId(catalog));
    if (!plan) return null;
    const planIndex = catalog.plans.indexOf(plan);
    const at = (path: string) => errors.get(path);

    const count = pricing.plans.find((p) => p.planId === plan.id);
    const on = count?.businesses ?? 0;
    const older = count?.olderVersion ?? 0;
    const usage = pricing.usage[plan.id] ?? [];

    const change = (fn: (c: Catalog) => void) => edit(fn);

    return (
        <section
            aria-label="Plan by plan"
            className="grid gap-3.5 rounded-[14px] border border-border bg-card p-4 text-[13.5px] sm:p-[18px]"
        >
            <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="flex-[1_1_auto] font-display text-[16px] font-semibold">
                    Plan by plan
                </h2>
                {canEdit && (
                    <AddButton
                        onClick={() => {
                            const made: { id: string | null } = { id: null };
                            edit((c) => {
                                made.id = addPlan(c);
                            });
                            if (made.id) {
                                setPlanId(made.id);
                                setFocusModule(null);
                            }
                        }}
                    >
                        Add plan
                    </AddButton>
                )}
            </div>
            {/* The plan being edited stays in view down the long list of rows,
                just under the console's 56px header (h-14). */}
            <div className="sticky top-14 z-10 -mx-4 bg-card px-4 py-1.5 sm:-mx-[18px] sm:px-[18px]">
                <div
                    role="group"
                    aria-label="Plans"
                    className="flex flex-wrap gap-1.5"
                >
                    {catalog.plans.map((p) => {
                        const selected = p.id === plan.id;
                        const changed = planChanged(liveCatalog, catalog, p.id);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                    setPlanId(p.id);
                                    setFocusModule(null);
                                }}
                                className={cn(
                                    "flex h-[34px] cursor-pointer items-center gap-2 rounded-[9px] border px-3 text-[13px] font-semibold transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-accent-active",
                                    selected
                                        ? "border-highlight bg-highlight-subtle hover:bg-highlight-subtle"
                                        : "border-border-strong bg-transparent",
                                    p.retired && "opacity-60",
                                )}
                            >
                                {p.name || "Unnamed plan"}
                                <span className="font-medium text-muted-foreground">
                                    {formatInr(p.pricePaise)}
                                </span>
                                {changed && (
                                    <span
                                        aria-label="Changed"
                                        role="img"
                                        className="size-[7px] rounded-full bg-highlight"
                                    />
                                )}
                                {p.retired && (
                                    <span className="sr-only">(retired)</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
                <span>
                    {on} {on === 1 ? "business" : "businesses"} on {plan.name}
                    {older ? ` · ${older} on an older version` : ""}
                </span>
                {plan.retired && (
                    <span className="font-semibold text-destructive">
                        Retired: not on the pricing page
                    </span>
                )}
                {canEdit &&
                    isUnpublishedPlan(liveCatalog, plan.id) &&
                    catalog.plans.length > 1 && (
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-[12.5px] text-destructive"
                            onClick={() => {
                                const taken: {
                                    r: ReturnType<typeof removePlan>;
                                } = { r: null };
                                const name = plan.name || "Unnamed plan";
                                edit((c) => {
                                    taken.r = removePlan(
                                        c,
                                        liveCatalog,
                                        plan.id,
                                    );
                                });
                                const removed = taken.r;
                                if (!removed) return;
                                setPlanId(null);
                                flash(`${name} removed`, {
                                    label: "Undo",
                                    onClick: () => {
                                        edit((c) => restorePlan(c, removed));
                                        setPlanId(removed.plan.id);
                                    },
                                });
                            }}
                        >
                            Remove plan
                        </Button>
                    )}
            </div>

            <PlanFields
                plan={plan}
                yearly={catalog.yearly}
                disabled={!canEdit}
                errors={{
                    name: at(`plans.${planIndex}.name`),
                    pricePaise: at(`plans.${planIndex}.pricePaise`),
                    cta: at(`plans.${planIndex}.cta`),
                    tagline: at(`plans.${planIndex}.tagline`),
                    plans: at("plans") ?? at(`plans.${planIndex}.id`),
                }}
                onChange={(patch) =>
                    change((c) => {
                        const p = c.plans.find((x) => x.id === plan.id);
                        if (p) Object.assign(p, patch);
                    })
                }
                onFeature={() => change((c) => toggleFeatured(c, plan.id))}
                onRetire={() =>
                    change((c) => {
                        const p = c.plans.find((x) => x.id === plan.id);
                        if (p) p.retired = !p.retired;
                    })
                }
            />

            <div className="grid border-t border-border">
                {groupModules(catalog).map((g) => (
                    <div key={g.id || "none"} role="group" aria-label={g.name}>
                        <h3 className="pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-subtle-foreground">
                            {g.name}
                        </h3>
                        {g.modules.map((m) => {
                            const i = catalog.modules.indexOf(m);
                            const cellPath = `modules.${i}.cells.${plan.id}`;
                            const u = usage.find((x) => x.moduleId === m.id);
                            return (
                                <ModuleRow
                                    key={m.id}
                                    ref={(el) => {
                                        ticks.current.set(m.id, el);
                                    }}
                                    module={m}
                                    planId={plan.id}
                                    changed={cellChanged(
                                        liveCatalog,
                                        m,
                                        plan.id,
                                    )}
                                    usage={usageLine(
                                        u,
                                        plan.name,
                                        cellOf(m, plan.id),
                                    )}
                                    focused={focusModule === m.id}
                                    disabled={!canEdit}
                                    errors={{
                                        text: at(`${cellPath}.text`),
                                        card: at(`${cellPath}.card`),
                                        limit: at(`${cellPath}.limit`),
                                    }}
                                    onInclude={(inc) =>
                                        change((c) =>
                                            setCell(
                                                c,
                                                m.id,
                                                plan.id,
                                                inc
                                                    ? includedCell(
                                                          liveCellOf(
                                                              liveCatalog,
                                                              m.id,
                                                              plan.id,
                                                          ),
                                                      )
                                                    : excludedCell(
                                                          liveCellOf(
                                                              liveCatalog,
                                                              m.id,
                                                              plan.id,
                                                          ),
                                                      ),
                                            ),
                                        )
                                    }
                                    onPatch={(patch) =>
                                        change((c) =>
                                            patchIncluded(
                                                c,
                                                m.id,
                                                plan.id,
                                                patch,
                                            ),
                                        )
                                    }
                                    onOff={(off) =>
                                        change((c) =>
                                            setCell(c, m.id, plan.id, {
                                                inc: false,
                                                off,
                                            }),
                                        )
                                    }
                                />
                            );
                        })}
                    </div>
                ))}
                {catalog.modules.length === 0 && (
                    <p className="pt-4 text-[13px] text-muted-foreground">
                        There are no modules yet. Add one on the Modules tab.
                    </p>
                )}
            </div>
        </section>
    );
}
