"use client";

import type {
    Catalog,
    CatalogModule,
    PricingDisplay,
} from "@saroh/pricing-catalog";
import { cellOf } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";

import {
    canMove,
    cellChanged,
    isNewModule,
    limitWords,
    menuLine,
    setModuleGroup,
} from "../plans/catalog-edits";
import { FIELD, SELECT } from "../plans/fields";
import { ModuleDetails } from "./module-details";

/**
 * One module's row in the Modules matrix (plans catalogue U8) — its name
 * and dashboard line, a cell per plan, how the pricing page shows it and
 * its order — and the inline details under it. Split from `tab-modules.tsx`
 * when the row groups' controls arrived.
 */

const PRICING_LABELS: Record<PricingDisplay, string> = {
    show: "Shown",
    soon: "Coming soon",
    hidden: "Hidden",
};

const ICON_BUTTON =
    "inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-border-strong transition-colors duration-fast hover:bg-muted active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40";

export function ModuleLine({
    module: m,
    catalog,
    liveCatalog,
    plans,
    canEdit,
    detailOpen,
    onDetail,
    onCell,
    onPricing,
    onMove,
}: {
    module: CatalogModule;
    catalog: Catalog;
    liveCatalog: Catalog | null;
    plans: Catalog["plans"];
    canEdit: boolean;
    detailOpen: boolean;
    onDetail: () => void;
    onCell: (planId: string) => void;
    onPricing: (v: PricingDisplay) => void;
    onMove: (step: -1 | 1) => void;
}) {
    return (
        <tr className="border-t border-border/70 align-top">
            <td className="px-3.5 py-2.5">
                <button
                    type="button"
                    aria-expanded={detailOpen}
                    onClick={onDetail}
                    className="grid cursor-pointer gap-0.5 rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card [&:active_.name]:text-muted-foreground [&:hover_.name]:underline"
                >
                    <span className="name font-semibold text-foreground underline-offset-2">
                        {m.name || "Unnamed module"}
                        {isNewModule(liveCatalog, m.id) && (
                            <span className="ml-1.5 rounded-full bg-info-subtle px-1.5 py-px text-[11px] font-semibold text-info-subtle-foreground no-underline">
                                New
                            </span>
                        )}
                    </span>
                    <span className="text-[12px] leading-[1.4] text-muted-foreground">
                        {menuLine(m)}
                    </span>
                </button>
            </td>
            {plans.map((p) => {
                const c = cellOf(m, p.id);
                const ch = cellChanged(liveCatalog, m, p.id);
                const lim = limitWords(c);
                const said = c.inc
                    ? `${c.text || "Included"}${lim ? `, ${c.soft ? "soft " : ""}limit ${lim}` : ""}`
                    : c.off === "hidden"
                      ? "Hidden"
                      : "Locked";
                return (
                    <td key={p.id} className="px-1.5 py-2">
                        <button
                            type="button"
                            onClick={() => onCell(p.id)}
                            aria-label={`${m.name} on ${p.name}: ${said}${ch ? ", changed" : ""}. Edit plan by plan`}
                            className={cn(
                                "relative grid min-h-10 w-full cursor-pointer gap-0.5 rounded-[8px] border px-[9px] py-[7px] text-left text-[12.5px] transition-[filter] duration-fast hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:brightness-90",
                                ch ? "border-highlight/60" : "border-border",
                                c.inc ? "bg-muted" : "bg-transparent",
                            )}
                        >
                            {ch && (
                                <span
                                    aria-hidden
                                    className="absolute right-1.5 top-1.5 size-[7px] rounded-full bg-highlight"
                                />
                            )}
                            {c.inc ? (
                                <>
                                    <span className="pr-2.5 leading-[1.35] text-foreground">
                                        {c.text || "Included"}
                                    </span>
                                    {lim && (
                                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
                                            Limit {lim}
                                            {c.soft && (
                                                <span className="rounded-full bg-info-subtle px-1.5 py-px text-[10.5px] font-semibold text-info-subtle-foreground">
                                                    soft
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span
                                    className={cn(
                                        "justify-self-start rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                        c.off === "hidden"
                                            ? "bg-muted text-muted-foreground"
                                            : "bg-warning-subtle text-warning-subtle-foreground",
                                    )}
                                >
                                    {c.off === "hidden" ? "Hidden" : "Locked"}
                                </span>
                            )}
                        </button>
                    </td>
                );
            })}
            <td className="px-1.5 py-2">
                <select
                    aria-label={`Pricing page for ${m.name}`}
                    value={m.pricing}
                    disabled={!canEdit}
                    onChange={(e) =>
                        onPricing(e.target.value as PricingDisplay)
                    }
                    className={cn(
                        FIELD,
                        SELECT,
                        "w-auto bg-muted px-2 text-[12.5px]",
                    )}
                >
                    {(Object.keys(PRICING_LABELS) as PricingDisplay[]).map(
                        (v) => (
                            <option key={v} value={v}>
                                {PRICING_LABELS[v]}
                            </option>
                        ),
                    )}
                </select>
            </td>
            <td className="whitespace-nowrap px-1.5 py-2">
                <span className="inline-flex gap-1">
                    <button
                        type="button"
                        aria-label={`Move ${m.name} up`}
                        disabled={!canEdit || !canMove(catalog, m.id, -1)}
                        onClick={() => onMove(-1)}
                        className={ICON_BUTTON}
                    >
                        <ArrowUp aria-hidden className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        aria-label={`Move ${m.name} down`}
                        disabled={!canEdit || !canMove(catalog, m.id, 1)}
                        onClick={() => onMove(1)}
                        className={ICON_BUTTON}
                    >
                        <ArrowDown aria-hidden className="size-3.5" />
                    </button>
                </span>
            </td>
        </tr>
    );
}

export function DetailsFor({
    module: m,
    catalog,
    errors,
    disabled,
    autoFocus,
    onDone,
    onRemove,
    change,
}: {
    module: CatalogModule;
    catalog: Catalog;
    errors: Map<string, string>;
    disabled: boolean;
    autoFocus: boolean;
    onDone: () => void;
    /** Only a module that was never published can be removed. */
    onRemove: (() => void) | null;
    change: (fn: (c: Catalog) => void) => void;
}) {
    const i = catalog.modules.indexOf(m);
    const set = (fn: (x: CatalogModule) => void) =>
        change((c) => {
            const x = c.modules.find((y) => y.id === m.id);
            if (x) fn(x);
        });
    return (
        <ModuleDetails
            module={m}
            groups={catalog.groups}
            disabled={disabled}
            autoFocus={autoFocus}
            errors={{
                name:
                    errors.get(`modules.${i}.name`) ??
                    errors.get(`modules.${i}.id`),
                group: errors.get(`modules.${i}.group`),
                what: errors.get(`modules.${i}.what`),
            }}
            onName={(name) => set((x) => (x.name = name))}
            onGroup={(group) => change((c) => setModuleGroup(c, m.id, group))}
            onWhat={(what) => set((x) => (x.what = what))}
            onDone={onDone}
            onRemove={onRemove}
        />
    );
}
