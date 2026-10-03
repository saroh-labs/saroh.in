"use client";

import type {
    Catalog,
    CatalogModule,
    PricingDisplay,
} from "@saroh/pricing-catalog";
import { cellOf, formatInr } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    Plus,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { usePlansNav } from "../plans-nav";
import {
    addModule,
    canMove,
    cellChanged,
    errorsByPath,
    groupModules,
    isNewModule,
    limitWords,
    menuLine,
    moveModule,
    setModuleGroup,
} from "../plans/catalog-edits";
import { FIELD, SELECT } from "../plans/fields";
import { ModuleDetails } from "./module-details";

/**
 * The Modules tab: "All modules" (plans catalogue U8, the design's matrix).
 * One row per module, grouped as the pricing page groups them, one column
 * per plan a business can choose, then how the pricing page shows the row
 * and its order in its group. A cell opens the Plans tab on that plan and
 * row; a module's name opens its details inline. The matrix scrolls
 * sideways inside itself on a narrow screen.
 *
 * Drawn from the shared draft and changed only through `edit`.
 */

const PRICING_LABELS: Record<PricingDisplay, string> = {
    show: "Shown",
    soon: "Coming soon",
    hidden: "Hidden",
};

const ICON_BUTTON =
    "inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-border-strong transition-colors duration-fast hover:bg-muted active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40";

export function TabModules() {
    const { catalog, live, edit, check, canEdit } = useDraft();
    const { pricing } = usePlans();
    const { setTab } = usePlansNav();
    const liveCatalog = live?.catalog ?? null;

    const [search, setSearch] = useState("");
    const [closed, setClosed] = useState<Record<string, boolean>>({});
    const [detail, setDetail] = useState<string | null>(null);
    const [added, setAdded] = useState<string | null>(null);

    const errors = useMemo(() => errorsByPath(check.errors), [check.errors]);

    if (!catalog) return null;
    const plans = catalog.plans.filter((p) => !p.retired);
    const span = plans.length + 3;
    const q = search.trim().toLowerCase();
    const groups = groupModules(catalog, (m) =>
        q ? m.name.toLowerCase().includes(q) : true,
    );
    const anyOpen = catalog.groups.some((g) => !closed[g.id]);
    const businessesOn = (planId: string) =>
        pricing.plans.find((p) => p.planId === planId)?.businesses ?? 0;
    const changed = (m: CatalogModule) =>
        isNewModule(liveCatalog, m.id) ||
        plans.some((p) => cellChanged(liveCatalog, m, p.id));
    const change = (fn: (c: Catalog) => void) => edit(fn);

    return (
        <section
            aria-label="All modules"
            className="grid gap-2.5 text-[13.5px]"
        >
            <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="flex-[1_1_auto] font-display text-[16px] font-semibold">
                    All modules
                </h2>
                <input
                    type="search"
                    placeholder="Find a module"
                    aria-label="Find a module"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={cn(FIELD, "w-full rounded-[9px] sm:w-[200px]")}
                />
                <Button
                    type="button"
                    variant="outline"
                    className="h-[34px] rounded-[9px] border-border-strong px-3 text-[12.5px]"
                    onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const g of catalog.groups) next[g.id] = anyOpen;
                        setClosed(next);
                    }}
                >
                    {anyOpen ? "Collapse all" : "Expand all"}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    disabled={!canEdit || catalog.groups.length === 0}
                    className="h-[34px] rounded-[9px] border border-border-strong px-3.5 text-[13px]"
                    onClick={() => {
                        const made: { id: string | null } = { id: null };
                        edit((c) => {
                            made.id = addModule(c);
                        });
                        if (!made.id) return;
                        setSearch("");
                        setClosed((s) => ({
                            ...s,
                            [catalog.groups[0].id]: false,
                        }));
                        setDetail(made.id);
                        setAdded(made.id);
                    }}
                >
                    <Plus aria-hidden className="size-3.5" />
                    Add module
                </Button>
            </div>

            <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted-foreground">
                <span>Click a cell to edit it plan by plan.</span>
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden
                        className="size-[7px] rounded-full bg-highlight"
                    />
                    Changed in this draft
                </span>
                <span>
                    <strong className="font-semibold text-warning-subtle-foreground">
                        Locked
                    </strong>{" "}
                    shows with an upgrade panel ·{" "}
                    <strong className="font-semibold text-foreground">
                        Hidden
                    </strong>{" "}
                    isn&apos;t in the menu
                </span>
            </p>

            <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
                <table className="w-full min-w-[860px] border-collapse">
                    <thead>
                        <tr className="text-left text-[12px] text-muted-foreground">
                            <th
                                scope="col"
                                className="w-[26%] px-3.5 py-3 font-semibold"
                            >
                                Module
                            </th>
                            {plans.map((p) => {
                                const n = businessesOn(p.id);
                                return (
                                    <th
                                        key={p.id}
                                        scope="col"
                                        className="px-2.5 py-3 font-semibold text-foreground"
                                    >
                                        {p.name}
                                        <div className="font-medium tabular-nums text-muted-foreground">
                                            {formatInr(p.pricePaise)} · {n}{" "}
                                            {n === 1
                                                ? "business"
                                                : "businesses"}
                                        </div>
                                    </th>
                                );
                            })}
                            <th
                                scope="col"
                                className="px-2.5 py-3 font-semibold"
                            >
                                Pricing page
                            </th>
                            <th
                                scope="col"
                                className="w-[70px] px-2.5 py-3 font-semibold"
                            >
                                Order
                            </th>
                        </tr>
                    </thead>
                    {groups.map((g) => {
                        const open = q ? true : !closed[g.id];
                        const n = g.modules.length;
                        const nch = g.modules.filter(changed).length;
                        return (
                            <tbody key={g.id || "none"}>
                                <tr>
                                    <th
                                        scope="rowgroup"
                                        colSpan={span}
                                        className="border-t border-border p-0"
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={open}
                                            onClick={() =>
                                                setClosed((s) => ({
                                                    ...s,
                                                    [g.id]: !s[g.id],
                                                }))
                                            }
                                            className="flex w-full cursor-pointer items-center gap-2 px-3.5 pb-2 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-subtle-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active"
                                        >
                                            {open ? (
                                                <ChevronDown
                                                    aria-hidden
                                                    className="size-3 text-muted-foreground"
                                                />
                                            ) : (
                                                <ChevronRight
                                                    aria-hidden
                                                    className="size-3 text-muted-foreground"
                                                />
                                            )}
                                            {g.name}
                                            <span className="font-medium normal-case tracking-normal text-muted-foreground">
                                                {n}{" "}
                                                {n === 1 ? "module" : "modules"}
                                                {nch ? ` · ${nch} changed` : ""}
                                            </span>
                                        </button>
                                    </th>
                                </tr>
                                {open &&
                                    g.modules.map((m) => (
                                        <Fragment key={m.id}>
                                            <ModuleLine
                                                module={m}
                                                catalog={catalog}
                                                liveCatalog={liveCatalog}
                                                plans={plans}
                                                canEdit={canEdit}
                                                detailOpen={detail === m.id}
                                                onDetail={() =>
                                                    setDetail((d) =>
                                                        d === m.id
                                                            ? null
                                                            : m.id,
                                                    )
                                                }
                                                onCell={(planId) =>
                                                    setTab("plans", {
                                                        planId,
                                                        moduleId: m.id,
                                                    })
                                                }
                                                onPricing={(v) =>
                                                    change((c) => {
                                                        const x =
                                                            c.modules.find(
                                                                (y) =>
                                                                    y.id ===
                                                                    m.id,
                                                            );
                                                        if (x) x.pricing = v;
                                                    })
                                                }
                                                onMove={(step) =>
                                                    change((c) =>
                                                        moveModule(
                                                            c,
                                                            m.id,
                                                            step,
                                                        ),
                                                    )
                                                }
                                            />
                                            {detail === m.id && (
                                                <tr>
                                                    <td
                                                        colSpan={span}
                                                        className="px-3.5 pb-4 pt-1"
                                                    >
                                                        <DetailsFor
                                                            module={m}
                                                            catalog={catalog}
                                                            errors={errors}
                                                            disabled={!canEdit}
                                                            autoFocus={
                                                                added === m.id
                                                            }
                                                            onDone={() => {
                                                                setDetail(null);
                                                                setAdded(null);
                                                            }}
                                                            change={change}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                            </tbody>
                        );
                    })}
                    {groups.length === 0 && (
                        <tbody>
                            <tr>
                                <td
                                    colSpan={span}
                                    className="border-t border-border px-3.5 py-6 text-center text-[13px] text-muted-foreground"
                                >
                                    {q
                                        ? `No module matches “${search.trim()}”.`
                                        : "There are no modules yet."}
                                </td>
                            </tr>
                        </tbody>
                    )}
                </table>
            </div>
        </section>
    );
}

function ModuleLine({
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
                    ? `${c.text || "Included"}${lim ? `, limit ${lim}` : ""}`
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
                                        <span className="text-[11.5px] text-muted-foreground">
                                            Limit {lim}
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

function DetailsFor({
    module: m,
    catalog,
    errors,
    disabled,
    autoFocus,
    onDone,
    change,
}: {
    module: CatalogModule;
    catalog: Catalog;
    errors: Map<string, string>;
    disabled: boolean;
    autoFocus: boolean;
    onDone: () => void;
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
        />
    );
}
