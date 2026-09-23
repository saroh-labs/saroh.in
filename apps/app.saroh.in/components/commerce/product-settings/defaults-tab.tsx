"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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

import { ReadOnlyNote } from "./categories-tab";
import {
    chipBtn,
    primaryBtn,
    smallBtn,
    TabIntro,
    textBox,
    useUnsaved,
} from "./product-settings";

/**
 * What a new product starts with — how to use it, when to warn about stock,
 * and its returns rule. A category's own value wins; left empty, the All
 * products value is used. Saved products keep theirs unless the merchant
 * chooses to update the ones still on the old value.
 */
export function DefaultsTab({
    storeId,
    catalogue,
}: {
    storeId: string;
    catalogue: CatalogueView;
}) {
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
            const res = await saveDefaults(
                storeId,
                rows.map(toEntry),
                applyExisting && hit.count > 0,
            );
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
                    ? `Defaults saved, and ${n} ${n === 1 ? "product" : "products"} updated.`
                    : "Defaults saved. Existing products keep their values.",
                () =>
                    start(async () => {
                        const undo = await undoDefaults(storeId, res.data);
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
                wins; leave it empty and the All products value is used. Saved
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
                                        ? `Used by every category that leaves a field empty · ${n} ${n === 1 ? "product" : "products"}`
                                        : `${n} ${n === 1 ? "product" : "products"} · ${
                                              own
                                                  ? `${own} of 3 fields set here, the rest from All products`
                                                  : "everything from All products"
                                          }`}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <label className="min-w-0 flex-[2_1_260px] text-[12px] font-medium">
                                    How to use or care for it
                                    <input
                                        value={r.howToUse}
                                        disabled={!catalogue.canWrite}
                                        onChange={(e) =>
                                            set(r.key, {
                                                howToUse: e.target.value,
                                            })
                                        }
                                        placeholder={
                                            isAll || !all?.howToUse
                                                ? "Nothing — each product says"
                                                : `All products: ${all.howToUse}`
                                        }
                                        className={cn(
                                            textBox,
                                            "mt-[5px] block h-[34px] w-full rounded-[7px] border-border px-[9px] font-normal",
                                        )}
                                    />
                                </label>
                                <label className="min-w-0 flex-[1_1_110px] text-[12px] font-medium">
                                    Warn at
                                    <input
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
                                        className={cn(
                                            textBox,
                                            "mt-[5px] block h-[34px] w-full rounded-[7px] px-[9px] font-normal",
                                            lowOk
                                                ? "border-border"
                                                : "border-destructive",
                                        )}
                                    />
                                </label>
                                <div className="min-w-0 flex-[1_1_100%]">
                                    <p className="mb-1.5 text-[12px] font-medium">
                                        Returns
                                    </p>
                                    <div
                                        role="radiogroup"
                                        aria-label={`${r.name} returns`}
                                        className="flex flex-wrap gap-1.5"
                                    >
                                        {choices.map((o) => (
                                            <button
                                                key={o.choice || "same"}
                                                type="button"
                                                role="radio"
                                                aria-checked={
                                                    r.returns === o.choice
                                                }
                                                disabled={!catalogue.canWrite}
                                                onClick={() =>
                                                    set(r.key, {
                                                        returns: o.choice,
                                                    })
                                                }
                                                className={chipBtn(
                                                    r.returns === o.choice,
                                                )}
                                            >
                                                {o.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {catalogue.canWrite
                                ? suggestions.map((s) => (
                                      <div
                                          key={`${s.key}:${s.field}`}
                                          className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[8px] bg-brand-subtle px-[11px] py-[9px]"
                                      >
                                          <span className="flex-[1_1_240px] text-pretty text-[12.5px] leading-[1.45] text-brand-subtle-foreground">
                                              {suggestionText(s, r.name)}
                                          </span>
                                          <button
                                              type="button"
                                              className={cn(
                                                  primaryBtn,
                                                  "h-7 px-2.5",
                                              )}
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
                                          </button>
                                          <button
                                              type="button"
                                              className={cn(
                                                  smallBtn,
                                                  "h-7 px-2.5",
                                              )}
                                              onClick={() =>
                                                  setDismissed({
                                                      ...dismissed,
                                                      [`${s.key}:${s.field}`]: true,
                                                  })
                                              }
                                          >
                                              Not now
                                          </button>
                                      </div>
                                  ))
                                : null}
                        </div>
                    );
                })}
            </div>

            {dirty && catalogue.canWrite ? (
                <div className="sticky bottom-0 z-10 mt-3.5 rounded-[10px] border border-highlight bg-muted px-3.5 py-2.5">
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
                                `New products start with this. ${changed.length} ${changed.length === 1 ? "value" : "values"} changed.`}
                        </span>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                                setRows(base);
                                setApplyExisting(false);
                            }}
                            className={smallBtn}
                        >
                            Discard
                        </button>
                        <button
                            type="button"
                            disabled={!!problem || pending}
                            onClick={save}
                            className={primaryBtn}
                        >
                            {pending ? "Saving…" : "Save defaults"}
                        </button>
                    </div>
                    {hit.count > 0 ? (
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={applyExisting}
                            onClick={() => setApplyExisting((v) => !v)}
                            className="mt-[9px] flex items-center gap-[9px] text-left text-[12.5px] text-foreground/75 coarse:min-h-11"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "size-4 shrink-0 rounded-[4px]",
                                    applyExisting
                                        ? "bg-foreground"
                                        : "border-[1.5px] border-border-strong bg-card",
                                )}
                            />
                            Also update the {hit.count} saved{" "}
                            {hit.count === 1 ? "product" : "products"} still
                            using an old value
                            {hit.where ? ` (${hit.where})` : ""}. Products with
                            their own value are left alone.
                        </button>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
