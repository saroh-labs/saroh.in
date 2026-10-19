"use client";

import type { Cell, LimitPeriod } from "@saroh/pricing-catalog";
import { cellOf } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useId, useMemo, useRef } from "react";

import type { ImpactItem } from "@/lib/pricing-types";

import { useDraft } from "../draft-store";
import { isLimitRow, reachLine, rowChanged } from "../grid/grid-model";
import { usePlans } from "../plans-context";
import {
    cellChanged,
    errorsByPath,
    excludedCell,
    includedCell,
    liveCellOf,
    patchIncluded,
    setCell,
    setLimit,
    usageLine,
} from "../plans/catalog-edits";
import { FIELD, Field, SELECT } from "../plans/fields";
import { ModuleRow } from "../plans/module-row";
import { ImpactItemCard } from "../publish/impact-list";
import { SheetFoot } from "./sheet-foot";
import {
    countedAcross,
    featureImpact,
    setCountedAll,
    setSoftAll,
    softAcross,
    softMix,
    wasLines,
} from "./sheet-model";

/**
 * One feature on every plan at once, from its name in the pricing table
 * (admin redesign U12, R21): how it is counted and whether its caps are
 * soft, once for every plan; then each plan's line (has it or not, its
 * limit, the comparison table's words and the plan card's line, each with
 * what it was on the live version); then who the change touches, from the
 * draft's impact.
 *
 * It saves through the draft store like the table's cells: every change is
 * one `edit()`, autosaved, with no Save button of its own, and no toast
 * (R9): "was …", the draft bar's count and Review and publish are the
 * feedback. Without `pricing:edit` it reads the same and nothing changes.
 */
export function FeatureSheet({
    moduleId,
    focusPlanId,
    onClose,
}: {
    moduleId: string;
    /** Opened from the Modules matrix on one plan: its line is lit and focused. */
    focusPlanId?: string | null;
    onClose: () => void;
}) {
    const { catalog, live, edit, check, canEdit, impact, hasDraft } =
        useDraft();
    const { pricing } = usePlans();
    const ids = useId();
    const ticks = useRef(new Map<string, HTMLButtonElement | null>());
    const errors = useMemo(() => errorsByPath(check.errors), [check.errors]);

    const index = catalog?.modules.findIndex((m) => m.id === moduleId) ?? -1;
    const feature = index >= 0 ? catalog?.modules[index] : undefined;
    if (!catalog || !feature) return null;

    const liveCatalog = live?.catalog ?? null;
    const plans = catalog.plans;
    const limitRow = isLimitRow(feature, liveCatalog);
    const counted = countedAcross(feature, plans);
    const soft = softAcross(feature, plans);
    const group = catalog.groups.find((g) => g.id === feature.group)?.name;
    const at = (path: string) => errors.get(path);
    const businessesOn = (planId: string) =>
        pricing.plans.find((x) => x.planId === planId)?.businesses ?? 0;

    const kind = !limitRow
        ? "Included or not, plan by plan"
        : counted === "month"
          ? "A limit, counted each month"
          : counted === "mixed"
            ? "A limit, counted differently by plan"
            : "A limit, counted in total";

    const include = (planId: string, on: boolean) =>
        edit((c) => {
            const was: Cell | null = liveCellOf(liveCatalog, moduleId, planId);
            if (!on) {
                setCell(c, moduleId, planId, excludedCell(was));
                return;
            }
            const next = includedCell(was);
            // A plan that gains the feature counts it as the others do.
            if (counted === "" || counted === "month") next.per = counted;
            setCell(c, moduleId, planId, next);
        });

    return (
        <Sheet
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]"
                onOpenAutoFocus={(e) => {
                    const tick = focusPlanId
                        ? ticks.current.get(focusPlanId)
                        : null;
                    if (!tick) return;
                    e.preventDefault();
                    tick.focus();
                }}
            >
                <SheetHeader className="border-b border-border px-6 pb-3.5 pt-5">
                    <SheetTitle>{feature.name}</SheetTitle>
                    <SheetDescription>
                        {kind}
                        {group ? ` · ${group}` : ""}
                    </SheetDescription>
                </SheetHeader>

                <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5 text-[13.5px]">
                    {(limitRow && counted !== null) || soft !== null ? (
                        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                            {limitRow && counted !== null && (
                                <Field
                                    label="Counted, for every plan at once"
                                    note={
                                        counted === "mixed"
                                            ? "The plans count it differently. Each plan below can count it its own way, or pick one here for all."
                                            : null
                                    }
                                    className="w-[220px] max-w-full"
                                >
                                    {(a) => (
                                        <select
                                            {...a}
                                            value={
                                                counted === "mixed"
                                                    ? "mixed"
                                                    : counted
                                            }
                                            disabled={!canEdit}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v !== "" && v !== "month")
                                                    return;
                                                const per: LimitPeriod = v;
                                                edit((c) =>
                                                    setCountedAll(
                                                        c,
                                                        moduleId,
                                                        per,
                                                    ),
                                                );
                                            }}
                                            className={cn(
                                                FIELD,
                                                SELECT,
                                                "bg-card",
                                            )}
                                        >
                                            {counted === "mixed" && (
                                                <option value="mixed" disabled>
                                                    Differs by plan
                                                </option>
                                            )}
                                            <option value="">In total</option>
                                            <option value="month">
                                                Each month
                                            </option>
                                        </select>
                                    )}
                                </Field>
                            )}
                            {soft !== null && (
                                <div className="grid gap-1 pb-1">
                                    <div className="flex items-center gap-2.5">
                                        <Checkbox
                                            id={`${ids}-soft`}
                                            checked={
                                                soft === "mixed"
                                                    ? "indeterminate"
                                                    : soft
                                            }
                                            disabled={!canEdit}
                                            aria-describedby={
                                                soft === "mixed"
                                                    ? `${ids}-soft-note`
                                                    : undefined
                                            }
                                            onCheckedChange={(v) =>
                                                edit((c) =>
                                                    setSoftAll(
                                                        c,
                                                        moduleId,
                                                        v === true,
                                                    ),
                                                )
                                            }
                                        />
                                        <label
                                            htmlFor={`${ids}-soft`}
                                            className="cursor-pointer text-foreground"
                                        >
                                            Soft limit on every plan: tell the
                                            business at the limit, never block
                                        </label>
                                    </div>
                                    {soft === "mixed" && (
                                        <span
                                            id={`${ids}-soft-note`}
                                            className="pl-[26px] text-[12px] text-muted-foreground"
                                        >
                                            {softMix(feature, plans)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}

                    <section aria-label="Each plan" className="grid">
                        {plans.map((plan) => {
                            const cell = cellOf(feature, plan.id);
                            const name = plan.name || "Unnamed plan";
                            const path = `modules.${index}.cells.${plan.id}`;
                            return (
                                <ModuleRow
                                    key={plan.id}
                                    ref={(el) => {
                                        ticks.current.set(plan.id, el);
                                    }}
                                    plan={name}
                                    planId={plan.id}
                                    feature={feature.name}
                                    cell={cell}
                                    changed={cellChanged(
                                        liveCatalog,
                                        feature,
                                        plan.id,
                                    )}
                                    was={wasLines(
                                        liveCatalog,
                                        feature,
                                        plan.id,
                                        limitRow,
                                    )}
                                    reach={reachLine(businessesOn(plan.id))}
                                    usage={usageLine(
                                        (pricing.usage[plan.id] ?? []).find(
                                            (u) => u.moduleId === feature.id,
                                        ),
                                        name,
                                        cell,
                                    )}
                                    focused={focusPlanId === plan.id}
                                    disabled={!canEdit}
                                    errors={{
                                        text: at(`${path}.text`),
                                        card: at(`${path}.card`),
                                        limit: at(`${path}.limit`),
                                    }}
                                    onInclude={(on) => include(plan.id, on)}
                                    onPatch={(patch) =>
                                        edit((c) =>
                                            patchIncluded(
                                                c,
                                                moduleId,
                                                plan.id,
                                                patch,
                                            ),
                                        )
                                    }
                                    onLimit={(limit) =>
                                        edit((c) =>
                                            setLimit(
                                                c,
                                                moduleId,
                                                plan.id,
                                                limit,
                                            ),
                                        )
                                    }
                                    onOff={(off) =>
                                        edit((c) =>
                                            setCell(c, moduleId, plan.id, {
                                                inc: false,
                                                off,
                                            }),
                                        )
                                    }
                                />
                            );
                        })}
                    </section>

                    <WhoThisTouches
                        name={feature.name}
                        changed={rowChanged(liveCatalog, catalog, feature)}
                        valid={check.valid}
                        pending={hasDraft && impact === null}
                        items={impact?.items ?? null}
                    />
                </div>

                <SheetFoot canEdit={canEdit} />
            </SheetContent>
        </Sheet>
    );
}

/**
 * "Who this touches": the draft's effects that are about this feature, as
 * the API worked them out for the saved draft, or why there is nothing to
 * list yet.
 */
function WhoThisTouches({
    name,
    changed,
    valid,
    pending,
    items,
}: {
    name: string;
    changed: boolean;
    valid: boolean;
    /** The draft is saving, or its impact is being worked out. */
    pending: boolean;
    items: readonly ImpactItem[] | null;
}) {
    const mine = items ? featureImpact(items, name) : [];
    let quiet: string | null = null;
    if (!changed) {
        quiet =
            "Nothing about this feature has changed yet. Each plan's line says who a change would reach.";
    } else if (!valid) {
        quiet =
            "The draft has something to fix first (marked beside its field), so its effect can't be worked out yet.";
    } else if (pending || !items) {
        quiet = "Worked out once the draft is saved…";
    } else if (mine.length === 0) {
        quiet = "No business is touched by these changes.";
    }
    return (
        <section
            aria-label="Who this touches"
            className="grid gap-2 rounded-[12px] bg-muted p-3.5"
        >
            <h3 className="font-semibold">Who this touches</h3>
            {quiet ? (
                <p
                    aria-live="polite"
                    className="text-[13px] text-muted-foreground"
                >
                    {quiet}
                </p>
            ) : (
                <ul className="grid gap-2">
                    {mine.map((item, i) => (
                        <ImpactItemCard
                            key={`${i}-${item.title}`}
                            item={item}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}
