"use client";

import { count, plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { markMomentSeen } from "@/lib/moments/actions";
import type {
    CatalogueView,
    DefaultsSuggestion,
} from "@/lib/products/settings";
import { saveDefaults, undoDefaults } from "@/lib/products/settings-actions";
import type { DefaultsRow } from "@/lib/products/settings-rules";
import {
    affected,
    changes,
    lowProblem,
    overrides,
    RETURN_RULES,
    rowsFrom,
    suggestionLine,
    toEntry,
} from "@/lib/products/settings-rules";

import { CheckRow } from "@/components/shared/check-row";
import { ChipGroup } from "@/components/shared/choice-group";
import { listTable } from "@/components/shared/list-toolbar";
import { runAction } from "@/lib/api/run-action";
import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import { Field } from "@saroh/ui/field";
import { CategoryDefaultsSheet, LOW_HINT } from "./category-defaults-sheet";
import { DefaultsReviewSheet } from "./defaults-review-sheet";
import { SettingsReadOnly, TabIntro, useUnsaved } from "./product-settings";

/**
 * What a new product starts with — how to use it, when it is low on stock,
 * and its returns rule. One All products card, a form with a save bar; then
 * the categories as compact rows saying only what each sets for itself,
 * with Edit opening the category's sheet. The suggestions read from the
 * products already there are one line with Review, and "Not now" puts
 * them away for the whole business (kept with its moments, so on every
 * device). Products already saved keep their values unless the merchant
 * chooses to update the ones still on the old value.
 */
export function DefaultsTab({ catalogue }: { catalogue: CatalogueView }) {
    const router = useRouter();
    const { report } = useUnsaved();
    const [pending, start] = useTransition();
    const fresh = rowsFrom(catalogue);
    const freshKey = JSON.stringify(fresh);
    const [base, setBase] = useState(fresh);
    const [rows, setRows] = useState(fresh);
    const [seen, setSeen] = useState(freshKey);
    const [applyExisting, setApplyExisting] = useState(false);
    const [tried, setTried] = useState(false);
    const [putAway, setPutAway] = useState(
        catalogue.defaults.suggestionsPutAway === true,
    );
    if (seen !== freshKey) {
        setSeen(freshKey);
        setBase(fresh);
        setRows(fresh);
    }

    const all = rows.find((r) => r.key === "all") ?? fresh[0];
    const allBase = base.find((r) => r.key === "all") ?? fresh[0];
    // Only All products is edited in place; a category saves from its sheet.
    const changed = changes([all], [allBase]);
    const dirty = changed.length > 0;
    const saveBar = useRef<HTMLDivElement>(null);
    useBottomBarInset(saveBar, dirty && catalogue.canWrite);
    const problem = tried ? lowProblem(all) : "";
    const names = Object.fromEntries(rows.map((r) => [r.key, r.name]));
    const hit = affected(changed, catalogue.defaults.stillOnDefault, names);
    const counts = catalogue.defaults.productCounts;
    const categories = rows.filter((r) => r.key !== "all");

    // Suggestions not already the category's own value.
    const open = catalogue.defaults.suggestions.filter((s) => {
        const r = rows.find((x) => x.key === s.key);
        if (!r) return false;
        return (
            String(s.field === "howToUse" ? r.howToUse : r.low) !==
            String(s.value)
        );
    });
    const line =
        catalogue.canWrite && !putAway
            ? suggestionLine(open, names, all.low)
            : "";

    /** Saves `entries`; resolves true once saved, with Undo offered. */
    async function saveRows(
        entries: DefaultsRow[],
        update: boolean,
        said: (updated: number) => string,
    ): Promise<boolean> {
        const res = await runAction(() =>
            saveDefaults(entries.map(toEntry), update),
        );
        if (!res) return false;
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        router.refresh();
        showUndo(said(res.data.updatedCount), () =>
            start(async () => {
                const undo = await runAction(() => undoDefaults(res.data));
                if (!undo) return;
                if (!undo.ok) showError(undo.error);
                router.refresh();
            }),
        );
        return true;
    }

    const savedLine = (n: number) =>
        n
            ? `Defaults saved, and ${count(n, "product")} updated.`
            : "Defaults saved. Products you already have keep theirs.";

    /** All products' card. The leave guard's Save and leave too. */
    async function persist(): Promise<boolean> {
        if (!dirty) return true;
        setTried(true);
        if (lowProblem(all)) return false;
        const ok = await saveRows(
            [all],
            applyExisting && hit.count > 0,
            savedLine,
        );
        if (ok) {
            setBase(rows);
            setApplyExisting(false);
            setTried(false);
        }
        return ok;
    }

    const persistRef = useRef(persist);
    useEffect(() => {
        persistRef.current = persist;
    });
    useEffect(() => {
        report(changed.length, () => persistRef.current());
        return () => report(0);
    }, [changed.length, report]);

    const setAll = (patch: Partial<DefaultsRow>) =>
        setRows(rows.map((r) => (r.key === "all" ? { ...r, ...patch } : r)));

    function applySuggestions(chosen: DefaultsSuggestion[]) {
        const next = new Map<string, DefaultsRow>();
        for (const s of chosen) {
            const r = next.get(s.key) ?? rows.find((x) => x.key === s.key);
            if (!r) continue;
            next.set(s.key, {
                ...r,
                ...(s.field === "howToUse"
                    ? { howToUse: String(s.value) }
                    : { low: String(s.value) }),
            });
        }
        return saveRows(Array.from(next.values()), false, () =>
            next.size === 1
                ? "Saved. New products in it start with this."
                : `Saved for ${count(next.size, "category", "categories")}.`,
        );
    }

    function notNow() {
        setPutAway(true);
        // Remembered for the business; failing that, it is only gone here.
        void runAction(() => markMomentSeen("defaults-suggestions"), {
            quiet: true,
        });
    }

    return (
        <section>
            <TabIntro title="Defaults">
                What a new product starts with. A category can set its own.
                Products you already have keep theirs.
            </TabIntro>
            {catalogue.canWrite ? null : <SettingsReadOnly />}

            <div className="rounded-[12px] border border-border bg-muted/50 px-4 py-3.5">
                <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                    <h3 className="text-[14px] font-semibold">All products</h3>
                    <span className="text-[12px] text-muted-foreground">
                        {count(counts.all ?? 0, "product")}
                    </span>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Field
                        label="Low stock at"
                        hint={problem ? undefined : LOW_HINT}
                        error={problem || undefined}
                        className="flex-[1_1_200px] space-y-[5px]"
                    >
                        <Input
                            dense
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={all.low}
                            disabled={!catalogue.canWrite}
                            onChange={(e) => setAll({ low: e.target.value })}
                            className="w-full min-w-0"
                        />
                    </Field>
                    <Field
                        label="How to use or care for it"
                        className="flex-[2_1_260px] space-y-[5px]"
                    >
                        <Input
                            dense
                            value={all.howToUse}
                            disabled={!catalogue.canWrite}
                            onChange={(e) =>
                                setAll({ howToUse: e.target.value })
                            }
                            placeholder="Nothing. Each product says"
                            className="w-full min-w-0"
                        />
                    </Field>
                    <div className="min-w-0 flex-[1_1_100%]">
                        <p className="mb-1.5 text-[12px] font-medium">
                            Returns
                        </p>
                        <ChipGroup
                            label="All products: returns"
                            value={all.returns}
                            onChange={(returns) => setAll({ returns })}
                            disabled={!catalogue.canWrite}
                            choices={RETURN_RULES.map((o) => ({
                                value: o.choice,
                                label: o.label,
                            }))}
                        />
                    </div>
                </div>
            </div>

            {dirty && catalogue.canWrite ? (
                <div
                    ref={saveBar}
                    className="sticky bottom-[var(--tab-bar-inset)] z-10 mt-3.5 rounded-[10px] border border-border-strong bg-muted px-3.5 py-2.5"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            role="status"
                            className={cn(
                                "flex-[1_1_200px] text-[12.5px]",
                                problem
                                    ? "text-destructive"
                                    : "text-foreground/75",
                            )}
                        >
                            {problem ||
                                `New products start with this. ${count(changed.length, "value")} changed.`}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={pending}
                            onClick={() => {
                                setRows(base);
                                setApplyExisting(false);
                                setTried(false);
                            }}
                        >
                            Discard
                        </Button>
                        <Button
                            size="sm"
                            type="button"
                            onClick={() =>
                                start(async () => {
                                    await runAction(persist);
                                })
                            }
                            busy={pending}
                            busyLabel="Saving…"
                        >
                            Save
                        </Button>
                    </div>
                    {hit.count > 0 ? (
                        <CheckRow
                            checked={applyExisting}
                            onChange={setApplyExisting}
                            className="mt-[9px] gap-[9px] text-[12.5px] text-foreground/75"
                        >
                            <span>
                                Also update the {hit.count} saved{" "}
                                {plural(hit.count, "product")} still using an
                                old value
                                {hit.where ? ` (${hit.where})` : ""}. Products
                                with their own value are left alone.
                            </span>
                        </CheckRow>
                    ) : null}
                </div>
            ) : null}

            <h3 className="mb-2 mt-[22px] text-[13.5px] font-semibold">
                Categories
            </h3>
            {line ? (
                <Notice
                    role="status"
                    align="center"
                    className="mb-2.5"
                    action={
                        <div className="flex flex-wrap gap-2">
                            <DefaultsReviewSheet
                                trigger={
                                    <Button size="sm" type="button">
                                        Review
                                    </Button>
                                }
                                suggestions={open}
                                names={names}
                                onUse={applySuggestions}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={notNow}
                            >
                                Not now
                            </Button>
                        </div>
                    }
                >
                    <span className="text-pretty">{line}</span>
                </Notice>
            ) : null}
            {categories.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No categories yet"
                    description="Each one you add can set its own."
                />
            ) : (
                <ul data-list-table="" className={listTable.card}>
                    {categories.map((r) => {
                        const own = overrides(r);
                        const n = counts[r.key] ?? 0;
                        return (
                            <li
                                key={r.key}
                                className={cn(
                                    "flex flex-wrap items-center gap-x-3 gap-y-1",
                                    listTable.rowStill,
                                )}
                            >
                                <div className="min-w-0 flex-[1_1_160px]">
                                    <p className="text-[13.5px] font-semibold [overflow-wrap:anywhere]">
                                        {r.name}
                                    </p>
                                    <p className="text-[12px] text-muted-foreground">
                                        {count(n, "product")}
                                    </p>
                                </div>
                                <p
                                    className={cn(
                                        "min-w-0 flex-[2_1_220px] text-[12.5px] [overflow-wrap:anywhere]",
                                        own.length
                                            ? "text-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {own.length
                                        ? own.join(" · ")
                                        : "Same as All products"}
                                </p>
                                {catalogue.canWrite ? (
                                    <CategoryDefaultsSheet
                                        trigger={
                                            <Button
                                                variant="outline"
                                                size="xs"
                                                type="button"
                                                aria-label={`Edit ${r.name} defaults`}
                                            >
                                                Edit
                                            </Button>
                                        }
                                        row={r}
                                        all={allBase}
                                        suggestions={open.filter(
                                            (s) => s.key === r.key,
                                        )}
                                        stillOnOld={(draft) =>
                                            affected(
                                                changes([draft], [r]),
                                                catalogue.defaults
                                                    .stillOnDefault,
                                                names,
                                            ).count
                                        }
                                        onSave={(draft, update) =>
                                            saveRows([draft], update, (u) =>
                                                u
                                                    ? `${r.name} saved, and ${count(u, "product")} updated.`
                                                    : `${r.name} saved. New products in it start with this.`,
                                            )
                                        }
                                    />
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
