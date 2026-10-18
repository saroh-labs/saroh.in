"use client";

import type { Catalog, CatalogModule, Plan } from "@saroh/pricing-catalog";
import { cellOf } from "@saroh/pricing-catalog";
import { Chip } from "@saroh/ui/chip";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListToolbar } from "@saroh/ui/list-toolbar";
import type { ReactNode } from "react";
import { useId, useMemo, useRef, useState } from "react";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import {
    excludedCell,
    groupModules,
    includedCell,
    liveCellOf,
    setCell,
    setLimit,
    usageLine,
} from "../plans/catalog-edits";
import type { CellChoice } from "./cell-editor";
import { GridCell } from "./grid-cell";
import type { GridFilter } from "./grid-model";
import {
    cellWas,
    GRID_FILTERS,
    isLimitRow,
    keepRow,
    matchesTerm,
    priceWas,
    reachLine,
    rowChanged,
} from "./grid-model";
import { GridEmpty, GridHint } from "./grid-notes";
import { PlanHead } from "./plan-head";
import type { GridPos } from "./use-grid-keys";
import { useGridKeys } from "./use-grid-keys";

/**
 * The Plans tab's pricing table, edited in its cells (admin redesign U11,
 * R20): plans across, features down, grouped as on the pricing page, with
 * the highlighted plan's column tinted. Each header has the plan's price
 * box and a pencil to its settings; each cell opens in place.
 *
 * - Every change is one `edit()` of the shared draft, so autosave, a 409's
 *   Reload and the outdated guard are the store's, unchanged. A cell edit
 *   says nothing in a toast (R9): the cell's "was …", the draft bar's count
 *   and Review and publish are its feedback.
 * - Search ("/") and the filters (All · Changed · Limits · Modules) are on
 *   this page only. A row changed since the last filter change stays in
 *   view, so a cell put back to live doesn't vanish under the keyboard.
 * - A feature's name opens it on every plan (`onFeature`, the feature
 *   sheet) and a plan's pencil opens its own settings (`onPlanSettings`,
 *   the plan sheet), admin redesign U12. The names are the grid's column
 *   -1, so the keyboard reaches them with ← from a row's first plan.
 * - Without `pricing:edit` it reads the same, and nothing opens but the
 *   sheets, which read the same too.
 * - On a phone the feature column stays put and the plan columns scroll
 *   inside the grid's box; the page itself never scrolls sideways.
 */
export function PricingGrid({
    catalog,
    onPlanSettings,
    onFeature,
    actions,
}: {
    catalog: Catalog;
    onPlanSettings: (planId: string) => void;
    onFeature: (moduleId: string) => void;
    /** On the toolbar's right: Add plan. */
    actions?: ReactNode;
}) {
    const { live, edit, canEdit } = useDraft();
    const { pricing } = usePlans();
    const liveCatalog = live?.catalog ?? null;
    const hintId = useId();

    const [term, setTerm] = useState("");
    const [searchKey, setSearchKey] = useState(0);
    const [filter, setFilter] = useState<GridFilter>("all");
    const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
    const [editing, setEditing] = useState<GridPos | null>(null);
    const prices = useRef(new Map<string, HTMLInputElement>());

    const plans = catalog.plans;
    const groupOf = useMemo(
        () => new Map(catalog.groups.map((g) => [g.id, g.name])),
        [catalog.groups],
    );
    const flags = useMemo(
        () =>
            new Map(
                catalog.modules.map((m) => [
                    m.id,
                    {
                        limit: isLimitRow(m, liveCatalog),
                        changed: rowChanged(liveCatalog, catalog, m),
                    },
                ]),
            ),
        [catalog, liveCatalog],
    );
    const flagsOf = (m: CatalogModule) =>
        flags.get(m.id) ?? { limit: false, changed: false };
    const searched = (m: CatalogModule) =>
        matchesTerm(term, m.name, groupOf.get(m.group) ?? "");

    const groups = groupModules(
        catalog,
        (m) => searched(m) && (keepRow(filter, flagsOf(m)) || kept.has(m.id)),
    );
    const rows = groups.flatMap((g) => g.modules);
    const counts = Object.fromEntries(
        GRID_FILTERS.map((f) => [
            f.id,
            catalog.modules.filter(
                (m) => searched(m) && keepRow(f.id, flagsOf(m)),
            ).length,
        ]),
    ) as Record<GridFilter, number>;

    // Not memoised by hand: `rows` is worked out fresh on every render,
    // and the compiler keeps what it can.
    const open = (p: GridPos) => {
        if (p.col === -1) {
            // A feature's name: the feature on every plan. The
            // "Feature" header above them opens nothing.
            const m = p.row >= 0 ? rows.at(p.row) : undefined;
            if (m) onFeature(m.id);
            return;
        }
        if (!canEdit) return;
        const plan = plans.at(p.col);
        if (!plan) return;
        if (p.row === -1) {
            const box = prices.current.get(plan.id);
            box?.focus();
            box?.select();
            return;
        }
        setEditing(p);
    };

    const keys = useGridKeys({
        size: { rows: rows.length, cols: plans.length, minRow: -1, minCol: -1 },
        onOpen: open,
    });

    const close = (p: GridPos) => {
        keys.focusCell(p);
        setEditing(null);
    };

    const commit = (
        p: GridPos,
        m: CatalogModule,
        plan: Plan,
        choice: CellChoice,
    ) => {
        const now = cellOf(m, plan.id);
        const was = liveCellOf(liveCatalog, m.id, plan.id);
        const limit = choice.inc ? choice.limit : undefined;
        const differs = choice.inc
            ? !now.inc || (limit !== undefined && now.limit !== limit)
            : now.inc;
        if (differs) {
            edit((c) => {
                if (!choice.inc) {
                    setCell(c, m.id, plan.id, excludedCell(was));
                    return;
                }
                if (!now.inc) setCell(c, m.id, plan.id, includedCell(was));
                if (limit !== undefined) setLimit(c, m.id, plan.id, limit);
            });
            setKept((s) => new Set(s).add(m.id));
        }
        close(p);
    };

    const pickFilter = (next: GridFilter) => {
        setFilter(next);
        setKept(new Set());
        setEditing(null);
    };
    const narrowed = term !== "" || filter !== "all";
    const clear = () => {
        setTerm("");
        setSearchKey((k) => k + 1);
        pickFilter("all");
    };

    const businessesOn = (planId: string) =>
        pricing.plans.find((x) => x.planId === planId)?.businesses ?? 0;
    const usageOf = (plan: Plan, m: CatalogModule) => (limit: number | null) =>
        usageLine(
            (pricing.usage[plan.id] ?? []).find((u) => u.moduleId === m.id),
            plan.name,
            { inc: true, text: "", card: "", limit, per: "", soft: false },
        );

    return (
        <section aria-label="Pricing table" className="grid min-w-0 gap-3">
            <ListToolbar
                search={
                    <ListSearch
                        key={searchKey}
                        placeholder="Search features"
                        onSearch={setTerm}
                    />
                }
                filters={
                    <div
                        role="group"
                        aria-label="Show"
                        className="flex flex-wrap gap-1.5"
                    >
                        {GRID_FILTERS.map((f) => (
                            <Chip
                                key={f.id}
                                as="toggle"
                                on={filter === f.id}
                                onClick={() => pickFilter(f.id)}
                            >
                                {f.label}
                                <span
                                    className={cn(
                                        "tabular-nums",
                                        filter !== f.id &&
                                            "text-muted-foreground",
                                    )}
                                >
                                    {counts[f.id]}
                                </span>
                            </Chip>
                        ))}
                    </div>
                }
                onClear={narrowed ? clear : undefined}
                end={actions}
            />
            <GridHint id={hintId} canEdit={canEdit} />

            {/* The grid's own box scrolls sideways; the page never does. */}
            <div
                data-scroll-x=""
                className="min-w-0 overflow-x-auto rounded-[14px] border border-border bg-card"
            >
                <table
                    role="grid"
                    aria-label="Plans and what each includes"
                    aria-describedby={hintId}
                    aria-readonly={canEdit ? undefined : true}
                    className="w-full border-separate border-spacing-0 text-[13px]"
                >
                    <thead>
                        <tr role="row">
                            <th
                                role="columnheader"
                                scope="col"
                                {...keys.cellProps({ row: -1, col: -1 })}
                                className="sticky left-0 z-[2] w-[38%] min-w-[140px] border-b border-border bg-card px-3 pb-2.5 pt-3 text-left align-bottom text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-w-[200px]"
                            >
                                Feature
                            </th>
                            {plans.map((plan, col) => (
                                <PlanHead
                                    key={plan.id}
                                    pos={{ row: -1, col }}
                                    keys={keys}
                                    plan={plan}
                                    was={priceWas(
                                        liveCatalog,
                                        catalog,
                                        plan.id,
                                    )}
                                    canEdit={canEdit}
                                    onPrice={(paise) =>
                                        edit((c) => {
                                            const x = c.plans.find(
                                                (y) => y.id === plan.id,
                                            );
                                            if (x) x.pricePaise = paise;
                                        })
                                    }
                                    onSettings={() => onPlanSettings(plan.id)}
                                    priceRef={(el) => {
                                        if (el) prices.current.set(plan.id, el);
                                        else prices.current.delete(plan.id);
                                    }}
                                />
                            ))}
                        </tr>
                    </thead>
                    {groups.map((g) => (
                        <tbody
                            key={g.id || "none"}
                            role="rowgroup"
                            aria-label={g.name}
                        >
                            <tr aria-hidden>
                                <td
                                    colSpan={plans.length + 1}
                                    className="px-0 pb-1.5 pt-4"
                                >
                                    <span className="sticky left-0 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-subtle-foreground">
                                        {g.name}
                                    </span>
                                </td>
                            </tr>
                            {g.modules.map((m) => {
                                const row = rows.indexOf(m);
                                const limitRow = flagsOf(m).limit;
                                return (
                                    <tr
                                        key={m.id}
                                        role="row"
                                        data-module={m.id}
                                    >
                                        <th
                                            role="rowheader"
                                            scope="row"
                                            {...keys.cellProps({
                                                row,
                                                col: -1,
                                            })}
                                            data-feature={m.id}
                                            onClick={() => {
                                                keys.focusCell({
                                                    row,
                                                    col: -1,
                                                });
                                                onFeature(m.id);
                                            }}
                                            className="sticky left-0 z-[1] cursor-pointer border-b border-border/70 bg-card px-3 py-2 text-left align-middle text-[13px] font-medium outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        >
                                            {m.name}
                                        </th>
                                        {plans.map((plan, col) => {
                                            const pos = { row, col };
                                            const name = `${m.name} on ${plan.name || "Unnamed plan"}`;
                                            return (
                                                <GridCell
                                                    key={plan.id}
                                                    pos={pos}
                                                    keys={keys}
                                                    name={name}
                                                    cell={cellOf(m, plan.id)}
                                                    limitRow={limitRow}
                                                    was={cellWas(
                                                        liveCatalog,
                                                        m,
                                                        plan.id,
                                                        limitRow,
                                                    )}
                                                    tinted={plan.featured}
                                                    editing={
                                                        editing?.row === row &&
                                                        editing.col === col
                                                    }
                                                    canEdit={canEdit}
                                                    reach={reachLine(
                                                        businessesOn(plan.id),
                                                    )}
                                                    usage={usageOf(plan, m)}
                                                    onOpen={(p) => {
                                                        keys.focusCell(p);
                                                        open(p);
                                                    }}
                                                    onCommit={(choice) =>
                                                        commit(
                                                            pos,
                                                            m,
                                                            plan,
                                                            choice,
                                                        )
                                                    }
                                                    onCancel={() => close(pos)}
                                                />
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    ))}
                </table>
            </div>
            {rows.length === 0 && (
                <GridEmpty
                    none={catalog.modules.length === 0}
                    unchanged={filter === "changed" && term === ""}
                    onShowAll={narrowed ? clear : undefined}
                />
            )}
        </section>
    );
}
