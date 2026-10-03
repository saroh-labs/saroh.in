"use client";

import type { CatalogModule, Cell, LimitPeriod } from "@saroh/pricing-catalog";
import { cellOf } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { cn } from "@saroh/ui/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { forwardRef } from "react";

import { LIMIT_HINT, parseLimit } from "./catalog-edits";
import { FIELD, Field, NumberField, SELECT, SMALL_FIELD } from "./fields";

/**
 * One module on one plan, in the Plans tab (plans catalogue U7): the
 * include tick, "Changed", the usage line, and either what the plan gets
 * (Comparison table, Plan card, Limit, Counted) or how it shows when the
 * plan hasn't got it (Locked | Hidden).
 */

export interface ModuleRowProps {
    module: CatalogModule;
    planId: string;
    changed: boolean;
    usage: string | null;
    /** Opened from the Modules matrix on this row. */
    focused: boolean;
    disabled: boolean;
    /** Validation messages for this cell, by field. */
    errors: { text?: string; card?: string; limit?: string };
    onInclude: (on: boolean) => void;
    onPatch: (patch: {
        text?: string;
        card?: string;
        limit?: number | null;
        per?: LimitPeriod;
    }) => void;
    onOff: (off: "locked" | "hidden") => void;
}

export const ModuleRow = forwardRef<HTMLButtonElement, ModuleRowProps>(
    function ModuleRow(
        {
            module,
            planId,
            changed,
            usage,
            focused,
            disabled,
            errors,
            onInclude,
            onPatch,
            onOff,
        },
        tickRef,
    ) {
        const cell: Cell = cellOf(module, planId);
        const tickId = `inc-${module.id}`;
        return (
            <div
                data-module={module.id}
                className={cn(
                    "-mx-2.5 grid gap-x-[18px] gap-y-2.5 rounded-[10px] border-t border-border/70 px-2.5 py-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]",
                    focused && "bg-highlight-subtle",
                )}
            >
                <div className="grid content-start gap-1">
                    <div className="flex items-center gap-[9px]">
                        <Checkbox
                            ref={tickRef}
                            id={tickId}
                            checked={cell.inc}
                            disabled={disabled}
                            onCheckedChange={(v) => onInclude(v === true)}
                            className="data-[state=checked]:border-highlight data-[state=checked]:bg-highlight data-[state=checked]:text-highlight-foreground dark:data-[state=checked]:border-highlight dark:data-[state=checked]:bg-highlight"
                        />
                        <label
                            htmlFor={tickId}
                            className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 font-semibold"
                        >
                            {module.name}
                            {changed && (
                                <span className="rounded-full bg-highlight-subtle px-1.5 py-px text-[11px] font-semibold text-highlight-subtle-foreground">
                                    Changed
                                </span>
                            )}
                        </label>
                    </div>
                    {usage && (
                        <span className="pl-[25px] text-[12px] leading-[1.45] text-muted-foreground">
                            {usage}
                        </span>
                    )}
                </div>
                {cell.inc ? (
                    <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
                        <Field
                            label="Comparison table"
                            small
                            error={errors.text}
                        >
                            {(a) => (
                                <input
                                    {...a}
                                    value={cell.text}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        onPatch({ text: e.target.value })
                                    }
                                    className={cn(FIELD, SMALL_FIELD)}
                                />
                            )}
                        </Field>
                        <Field
                            label="Plan card (blank: leave off)"
                            small
                            error={errors.card}
                        >
                            {(a) => (
                                <input
                                    {...a}
                                    value={cell.card}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        onPatch({ card: e.target.value })
                                    }
                                    className={cn(FIELD, SMALL_FIELD)}
                                />
                            )}
                        </Field>
                        <NumberField
                            label="Limit (blank: none)"
                            small
                            value={cell.limit}
                            format={(v) => (v == null ? "" : String(v))}
                            parse={parseLimit}
                            onCommit={(limit) => onPatch({ limit })}
                            hint={LIMIT_HINT}
                            error={errors.limit}
                            disabled={disabled}
                        />
                        <Field label="Counted" small>
                            {(a) => (
                                <select
                                    {...a}
                                    value={cell.per}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        onPatch({
                                            per: e.target.value as LimitPeriod,
                                        })
                                    }
                                    className={cn(
                                        FIELD,
                                        SMALL_FIELD,
                                        SELECT,
                                        "bg-card px-2",
                                    )}
                                >
                                    <option value="">In total</option>
                                    <option value="month">Each month</option>
                                </select>
                            )}
                        </Field>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            id={`off-${module.id}`}
                            className="text-[12px] text-muted-foreground"
                        >
                            In the dashboard:
                        </span>
                        <ToggleGroup
                            type="single"
                            value={cell.off}
                            disabled={disabled}
                            onValueChange={(v) => {
                                if (v === "locked" || v === "hidden") onOff(v);
                            }}
                            aria-labelledby={`off-${module.id}`}
                            className="gap-0.5 rounded-[9px] border border-border bg-muted p-[3px]"
                        >
                            {(["locked", "hidden"] as const).map((v) => (
                                <ToggleGroupItem
                                    key={v}
                                    value={v}
                                    aria-label={`${v === "locked" ? "Locked" : "Hidden"} for ${module.name}`}
                                    className="h-7 rounded-[6px] px-3 text-[12.5px] font-semibold text-muted-foreground hover:bg-background/40 hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                >
                                    {v === "locked" ? "Locked" : "Hidden"}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <span className="text-[12px] text-muted-foreground">
                            {cell.off === "hidden"
                                ? "Not in the menu at all."
                                : "In the menu with a lock and an upgrade panel."}
                        </span>
                    </div>
                )}
            </div>
        );
    },
);
