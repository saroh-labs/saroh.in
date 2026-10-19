"use client";

import type { Cell, IncludedCell, LimitPeriod } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { forwardRef, useId } from "react";

import { LIMIT_HINT, parseLimit } from "./catalog-edits";
import { FIELD, Field, NumberField, SELECT, SMALL_FIELD } from "./fields";

/**
 * One plan's line in the feature sheet (admin redesign U12, R21; the Plans
 * tab's module row before it): whether the plan has the feature, what it
 * was on the live version, who it reaches and how much they use, and
 * either what the plan gets (the comparison table's words, the plan card's
 * line, the limit and whether that cap is soft) or how it shows when the
 * plan hasn't got it (Locked | Hidden). How it is counted is set here for
 * this plan; the sheet can also set it for every plan at once.
 */

export type CellPatch = Partial<Omit<IncludedCell, "inc" | "limit">>;

export interface ModuleRowProps {
    /** The plan's name. */
    plan: string;
    planId: string;
    /** The feature's name, for the controls' names. */
    feature: string;
    cell: Cell;
    changed: boolean;
    /** What it was on live, when changed ("Was 111"). */
    was: string[];
    /** "Reaches 2 businesses at renewal". */
    reach: string;
    usage: string | null;
    /** Opened from the Modules matrix on this plan. */
    focused: boolean;
    disabled: boolean;
    /** Validation messages for this cell, by field. */
    errors: { text?: string; card?: string; limit?: string };
    onInclude: (on: boolean) => void;
    onPatch: (patch: CellPatch) => void;
    onLimit: (limit: number | null) => void;
    onOff: (off: "locked" | "hidden") => void;
}

export const ModuleRow = forwardRef<HTMLButtonElement, ModuleRowProps>(
    function ModuleRow(
        {
            plan,
            planId,
            feature,
            cell,
            changed,
            was,
            reach,
            usage,
            focused,
            disabled,
            errors,
            onInclude,
            onPatch,
            onLimit,
            onOff,
        },
        tickRef,
    ) {
        const id = useId();
        const tickId = `${id}-inc`;
        const softId = `${id}-soft`;
        const offId = `${id}-off`;
        return (
            <div
                data-plan={planId}
                className={cn(
                    "-mx-2.5 grid gap-x-[18px] gap-y-2.5 rounded-[10px] border-t border-border/70 px-2.5 py-3 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)]",
                    focused && "bg-highlight-subtle",
                )}
            >
                <div className="grid content-start gap-1">
                    <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1">
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
                            className="min-w-0 cursor-pointer font-semibold"
                        >
                            {plan}
                            <span className="sr-only"> has {feature}</span>
                        </label>
                        {changed && (
                            <span className="rounded-full bg-highlight-subtle px-1.5 py-px text-[11px] font-semibold text-highlight-subtle-foreground">
                                Changed
                            </span>
                        )}
                    </div>
                    <div className="grid gap-0.5 pl-[25px] text-[12px] leading-[1.45]">
                        {was.map((line) => (
                            <span
                                key={line}
                                className="font-medium text-warning"
                            >
                                {line}
                            </span>
                        ))}
                        <span className="text-muted-foreground">{reach}</span>
                        {usage && (
                            <span className="text-muted-foreground">
                                {usage}
                            </span>
                        )}
                    </div>
                </div>
                {cell.inc ? (
                    <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-3">
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
                            label="Line on the plan card (optional)"
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
                            label="Limit (empty for none)"
                            small
                            value={cell.limit}
                            format={(v) => (v == null ? "" : String(v))}
                            parse={parseLimit}
                            onCommit={onLimit}
                            hint={LIMIT_HINT}
                            error={errors.limit}
                            disabled={disabled}
                        />
                        <Field label={`Counted on ${plan}`} small>
                            {(a) => (
                                <select
                                    {...a}
                                    value={cell.per}
                                    disabled={disabled}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v !== "" && v !== "month") return;
                                        const per: LimitPeriod = v;
                                        onPatch({ per });
                                    }}
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
                        {cell.limit != null && (
                            <div className="col-span-full flex items-start gap-2.5">
                                <Switch
                                    id={softId}
                                    checked={cell.soft}
                                    disabled={disabled}
                                    onCheckedChange={(soft) =>
                                        onPatch({ soft })
                                    }
                                    aria-describedby={`${softId}-note`}
                                    className="mt-px h-5 w-9 [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4"
                                />
                                <div className="grid gap-0.5">
                                    <label
                                        htmlFor={softId}
                                        className="cursor-pointer text-[12.5px] font-semibold text-foreground"
                                    >
                                        Soft limit on {plan}
                                    </label>
                                    <span
                                        id={`${softId}-note`}
                                        className="text-[12px] leading-[1.45] text-muted-foreground"
                                    >
                                        {cell.soft
                                            ? "At the limit the business is told, and nothing stops."
                                            : "At the limit the business can't add more."}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            id={offId}
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
                            aria-labelledby={offId}
                            className="gap-0.5 rounded-[9px] border border-border bg-muted p-[3px]"
                        >
                            {(["locked", "hidden"] as const).map((v) => (
                                <ToggleGroupItem
                                    key={v}
                                    value={v}
                                    aria-label={`${v === "locked" ? "Locked" : "Hidden"} on ${plan}`}
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
