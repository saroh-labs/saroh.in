"use client";

import { count, plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { CatalogueView } from "@/lib/products/settings";
import { saveDefaults, undoDefaults } from "@/lib/products/settings-actions";
import type { DefaultsRow, ReturnsChoice } from "@/lib/products/settings-rules";
import {
    affected,
    changes,
    defaultsProblem,
    RETURN_RULES,
    returnsLabel,
    rowsFrom,
    suggestionText,
    toEntry,
} from "@/lib/products/settings-rules";

import { CheckRow } from "@/components/shared/check-row";
import { ChipGroup } from "@/components/shared/choice-group";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { runAction } from "@/lib/api/run-action";
import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import { Field } from "@saroh/ui/field";
import { TabIntro, useUnsaved } from "./product-settings";

/**
 * What a new product starts with — how to use it, when to warn about stock,
 * and its returns rule. A category's own value wins; left empty, the All
 * products value is used. Saved products keep theirs unless the merchant
 * chooses to update the ones still on the old value.
 */
export function DefaultsTab({ catalogue }: { catalogue: CatalogueView }) {
    const router = useRouter();
    const { setDirty } = useUnsaved();
    const [pending, start] = useTransition();
    const fresh = rowsFrom(catalogue);
    const freshKey = JSON.stringify(fresh);
    const [base, setBase] = useState(fresh);
    const [rows, setRows] = useState(fresh);
    const [seen, setSeen] = useState(freshKey);
    const [applyExisting, setApplyExisting] = useState(false);
    const [dismissed, setDismissed] = useState<Partial<Record<string, true>>>(
        {},
    );
    if (seen !== freshKey) {
        setSeen(freshKey);
        setBase(fresh);
        setRows(fresh);
    }

    const changed = changes(rows, base);
    const dirty = changed.length > 0;
    const saveBar = useRef<HTMLDivElement>(null);
    useBottomBarInset(saveBar, dirty && catalogue.canWrite);
    const problem = defaultsProblem(rows);
    const names = Object.fromEntries(rows.map((r) => [r.key, r.name]));
    const hit = affected(changed, catalogue.defaults.stillOnDefault, names);
    const all = rows.find((r) => r.key === "all");
    const counts = catalogue.defaults.productCounts;

    useEffect(() => {
        setDirty(dirty);
        return () => setDirty(false);
    }, [dirty, setDirty]);

    const set = (key: string, patch: Partial<DefaultsRow>) =>
        setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    function save() {
        if (problem || !dirty) return;
        start(async () => {
            const res = await runAction(() =>
                saveDefaults(rows.map(toEntry), applyExisting && hit.count > 0),
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setBase(rows);
            setApplyExisting(false);
            router.refresh();
            const n = res.data.updatedCount;
            showUndo(
                n
                    ? `Defaults saved, and ${count(n, "product")} updated.`
                    : "Defaults saved. Existing products keep their values.",
                () =>
                    start(async () => {
                        const undo = await runAction(() =>
                            undoDefaults(res.data),
                        );
                        if (!undo) return;
                        if (!undo.ok) showError(undo.error);
                        router.refresh();
                    }),
            );
        });
    }

    return (
        <section>
            <TabIntro title="Defaults">
                What a new product starts with. A category&apos;s own value
                wins. Leave it empty and the All products value is used. Saved
                products keep their values unless you choose to update them.
            </TabIntro>
            {catalogue.canWrite ? null : <ReadOnlyNote />}

            <div className="flex flex-col gap-3">
                {rows.map((r) => {
                    const isAll = r.key === "all";
                    const own = isAll
                        ? 0
                        : [r.howToUse.trim(), r.low.trim(), r.returns].filter(
                              Boolean,
                          ).length;
                    const lowOk = isAll
                        ? /^\d+$/.test(r.low.trim())
                        : r.low.trim() === "" || /^\d+$/.test(r.low.trim());
                    const n = counts[r.key] ?? 0;
                    const choices: { choice: ReturnsChoice; label: string }[] =
                        [
                            ...(isAll
                                ? []
                                : [
                                      {
                                          choice: "" as const,
                                          label: `Same as All products (${returnsLabel(all?.returns ?? "STOREFRONT")})`,
                                      },
                                  ]),
                            ...RETURN_RULES,
                            // A rule of its own, typed on a product once, stays
                            // choosable rather than vanishing.
                            ...(r.returns.startsWith("OWN:") &&
                            !RETURN_RULES.some((x) => x.choice === r.returns)
                                ? [
                                      {
                                          choice: r.returns,
                                          label: returnsLabel(r.returns),
                                      },
                                  ]
                                : []),
                        ];
                    const suggestions = catalogue.defaults.suggestions.filter(
                        (s) =>
                            s.key === r.key &&
                            !dismissed[`${s.key}:${s.field}`] &&
                            String(
                                s.field === "howToUse" ? r.howToUse : r.low,
                            ) !== String(s.value),
                    );
                    return (
                        <div
                            key={r.key}
                            className={cn(
                                "rounded-[12px] border border-border px-4 py-3.5",
                                isAll ? "bg-muted/50" : "bg-card",
                            )}
                        >
                            <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                                <span className="text-[14px] font-semibold">
                                    {r.name}
                                </span>
                                <span className="flex-[1_1_200px] text-[12px] text-muted-foreground">
                                    {isAll
                                        ? `Used by every category that leaves a field empty · ${count(n, "product")}`
                                        : `${count(n, "product")} · ${
                                              own
                                                  ? `${own} of 3 fields set here, the rest from All products`
                                                  : "everything from All products"
                                          }`}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Field
                                    label="How to use or care for it"
                                    className="flex-[2_1_260px] space-y-[5px]"
                                >
                                    <Input
                                        dense
                                        value={r.howToUse}
                                        disabled={!catalogue.canWrite}
                                        onChange={(e) =>
                                            set(r.key, {
                                                howToUse: e.target.value,
                                            })
                                        }
                                        placeholder={
                                            isAll || !all?.howToUse
                                                ? "Nothing. Each product says"
                                                : `All products: ${all.howToUse}`
                                        }
                                        className="w-full min-w-0"
                                    />
                                </Field>
                                <Field
                                    label="Warn at"
                                    className="flex-[1_1_110px] space-y-[5px]"
                                >
                                    <Input
                                        dense
                                        type="number"
                                        min={0}
                                        inputMode="numeric"
                                        value={r.low}
                                        disabled={!catalogue.canWrite}
                                        onChange={(e) =>
                                            set(r.key, { low: e.target.value })
                                        }
                                        placeholder={
                                            isAll
                                                ? ""
                                                : `All products: ${all?.low ?? ""}`
                                        }
                                        aria-invalid={!lowOk}
                                        className="w-full min-w-0"
                                    />
                                </Field>
                                <div className="min-w-0 flex-[1_1_100%]">
                                    <p className="mb-1.5 text-[12px] font-medium">
                                        Returns
                                    </p>
                                    <ChipGroup
                                        label={`${r.name} returns`}
                                        value={r.returns}
                                        onChange={(returns) =>
                                            set(r.key, { returns })
                                        }
                                        disabled={!catalogue.canWrite}
                                        choices={choices.map((o) => ({
                                            value: o.choice,
                                            label: o.label,
                                        }))}
                                    />
                                </div>
                            </div>
                            {catalogue.canWrite
                                ? suggestions.map((s) => (
                                      <div
                                          key={`${s.key}:${s.field}`}
                                          className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[8px] bg-muted px-[11px] py-[9px]"
                                      >
                                          <span className="flex-[1_1_240px] text-pretty text-[12.5px] leading-[1.45] text-foreground">
                                              {suggestionText(s, r.name)}
                                          </span>
                                          <Button
                                              size="sm"
                                              type="button"
                                              onClick={() =>
                                                  set(r.key, {
                                                      [s.field === "howToUse"
                                                          ? "howToUse"
                                                          : "low"]: String(
                                                          s.value,
                                                      ),
                                                  })
                                              }
                                          >
                                              Use it
                                          </Button>
                                          <Button
                                              variant="outline"
                                              size="sm"
                                              type="button"
                                              onClick={() =>
                                                  setDismissed({
                                                      ...dismissed,
                                                      [`${s.key}:${s.field}`]: true,
                                                  })
                                              }
                                          >
                                              Not now
                                          </Button>
                                      </div>
                                  ))
                                : null}
                        </div>
                    );
                })}
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
                            }}
                        >
                            Discard
                        </Button>
                        <Button
                            size="sm"
                            type="button"
                            disabled={!!problem}
                            onClick={save}
                            busy={pending}
                            busyLabel="Saving…"
                        >
                            Save defaults
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
        </section>
    );
}
