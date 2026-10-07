"use client";

import type { Catalog, CatalogModule } from "@saroh/pricing-catalog";
import { formatInr } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ScrollX } from "@saroh/ui/scroll-x";
import { Fragment, useMemo, useState } from "react";

import { AddButton } from "../add-button";
import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { usePlansNav } from "../plans-nav";
import {
    addModule,
    cellChanged,
    errorsByPath,
    groupModules,
    isNewModule,
    moveModule,
} from "../plans/catalog-edits";
import { FIELD } from "../plans/fields";
import {
    addGroup,
    canRemoveGroup,
    isUnpublishedModule,
    removeGroup,
    removeModule,
    renameGroup,
    restoreModule,
} from "../plans/structure-edits";
import { useFlash } from "../toast";
import { GroupHead } from "./group-head";
import { DetailsFor, ModuleLine } from "./module-line";

/**
 * The Modules tab: "All modules" (plans catalogue U8, the design's matrix).
 * One row per module, grouped as the pricing page groups them, one column
 * per plan a business can choose, then how the pricing page shows the row
 * and its order in its group. A cell opens the Plans tab on that plan and
 * row; a module's name opens its details inline. The matrix scrolls
 * sideways inside itself on a narrow screen. Row groups are made, renamed
 * and (once empty) removed here, and a module that was never published can
 * be removed again, with Undo.
 *
 * Drawn from the shared draft and changed only through `edit`.
 */

export function TabModules() {
    const { catalog, live, edit, check, canEdit } = useDraft();
    const { pricing } = usePlans();
    const { setTab } = usePlansNav();
    const flash = useFlash();
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
    // Searching shows only groups with a match; otherwise an empty group
    // shows too, so it can be filled, renamed or removed.
    const groups = groupModules(
        catalog,
        (m) => (q ? m.name.toLowerCase().includes(q) : true),
        { keepEmpty: !q },
    );
    const anyOpen = catalog.groups.some((g) => !closed[g.id]);
    const businessesOn = (planId: string) =>
        pricing.plans.find((p) => p.planId === planId)?.businesses ?? 0;
    const changed = (m: CatalogModule) =>
        isNewModule(liveCatalog, m.id) ||
        plans.some((p) => cellChanged(liveCatalog, m, p.id));
    const change = (fn: (c: Catalog) => void) => edit(fn);

    function addModuleTo(groupId?: string) {
        const made: { id: string | null; group: string | null } = {
            id: null,
            group: null,
        };
        edit((c) => {
            made.id = addModule(c, undefined, groupId);
            made.group = c.modules.find((x) => x.id === made.id)?.group ?? null;
        });
        if (!made.id) return;
        const id = made.id;
        const group = made.group;
        setSearch("");
        if (group) setClosed((s) => ({ ...s, [group]: false }));
        setDetail(id);
        setAdded(id);
    }

    function removeModuleNow(m: CatalogModule) {
        const taken: { r: ReturnType<typeof removeModule> } = { r: null };
        edit((c) => {
            taken.r = removeModule(c, liveCatalog, m.id);
        });
        const removed = taken.r;
        if (!removed) return;
        setDetail(null);
        flash(`${m.name || "Module"} removed`, {
            label: "Undo",
            onClick: () => edit((c) => restoreModule(c, removed)),
        });
    }

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
                {canEdit && (
                    <AddButton
                        onClick={() => {
                            const made: { id: string | null } = { id: null };
                            edit((c) => {
                                made.id = addGroup(c);
                            });
                            const id = made.id;
                            if (id) setClosed((s) => ({ ...s, [id]: false }));
                        }}
                    >
                        Add group
                    </AddButton>
                )}
                {canEdit && (
                    <AddButton
                        disabled={catalog.groups.length === 0}
                        aria-describedby={
                            catalog.groups.length === 0
                                ? "add-module-why"
                                : undefined
                        }
                        onClick={() => addModuleTo()}
                    >
                        Add module
                    </AddButton>
                )}
            </div>
            {canEdit && catalog.groups.length === 0 && (
                <p
                    id="add-module-why"
                    className="text-[12.5px] text-muted-foreground"
                >
                    A module sits in a row group. Add a group first.
                </p>
            )}

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

            {/* The console's one wide ledger: on a narrow screen it scrolls
                sideways and says so (ScrollX fades the side with more). */}
            <ScrollX
                label="All modules, by plan"
                className="rounded-[12px] border border-border bg-card"
            >
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
                                        className="border-t border-border p-0 font-normal"
                                    >
                                        <GroupHead
                                            name={g.name}
                                            open={open}
                                            count={n}
                                            changed={nch}
                                            canEdit={canEdit}
                                            canRemove={
                                                !!g.id &&
                                                canRemoveGroup(catalog, g.id)
                                            }
                                            onToggle={() =>
                                                setClosed((s) => ({
                                                    ...s,
                                                    [g.id]: !s[g.id],
                                                }))
                                            }
                                            onRename={
                                                g.id
                                                    ? (name) =>
                                                          change((c) =>
                                                              renameGroup(
                                                                  c,
                                                                  g.id,
                                                                  name,
                                                              ),
                                                          )
                                                    : null
                                            }
                                            onAddModule={
                                                g.id
                                                    ? () => addModuleTo(g.id)
                                                    : null
                                            }
                                            onRemove={() =>
                                                change((c) =>
                                                    removeGroup(c, g.id),
                                                )
                                            }
                                        />
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
                                                            onRemove={
                                                                canEdit &&
                                                                isUnpublishedModule(
                                                                    liveCatalog,
                                                                    m.id,
                                                                )
                                                                    ? () =>
                                                                          removeModuleNow(
                                                                              m,
                                                                          )
                                                                    : null
                                                            }
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
            </ScrollX>
        </section>
    );
}
