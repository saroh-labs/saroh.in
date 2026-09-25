"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { SkuPreview, SkuSettings } from "@/lib/products/settings";
import {
    previewSkuPattern,
    saveSkuPattern,
} from "@/lib/products/settings-actions";
import { patternProblem } from "@/lib/products/sku-pattern";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { primaryBtn, smallBtn, TabIntro, useUnsaved } from "./product-settings";

const TOKENS = [
    { t: "{NAME3}", what: "first 3 letters of the name" },
    { t: "{CAT}", what: "category, 3 letters" },
    { t: "{VALUE}", what: "the variant's option value" },
    { t: "{N}", what: "the product's number, 01, 02…" },
];

const SHOWN = 8;

/**
 * How the editor suggests a SKU. Only a suggestion: the field stays
 * editable, and SKUs that already exist are never rewritten. The preview
 * names every variant as the pattern would, and a pattern that would give
 * two the same SKU is refused with the part that would fix it.
 */
export function SkuTab({
    settings,
    preview: initialPreview,
    canWrite,
}: {
    settings: SkuSettings;
    preview: SkuPreview | null;
    canWrite: boolean;
}) {
    const router = useRouter();
    const { setDirty } = useUnsaved();
    const [saved, setSaved] = useState({
        pattern: settings.pattern,
        suggest: settings.suggest,
    });
    const [pattern, setPattern] = useState(settings.pattern);
    const [suggest, setSuggest] = useState(settings.suggest);
    const [preview, setPreview] = useState(initialPreview);
    const [pending, start] = useTransition();

    const dirty = pattern !== saved.pattern || suggest !== saved.suggest;
    const own = patternProblem(pattern);
    // The server's check includes clashes; its answer is for the pattern
    // it was asked about, so a stale one is not shown.
    const problem = own || (preview?.problem ?? "");

    useEffect(() => {
        setDirty(dirty);
        return () => setDirty(false);
    }, [dirty, setDirty]);

    useEffect(() => {
        if (patternProblem(pattern)) return;
        let live = true;
        const t = setTimeout(() => {
            void previewSkuPattern(pattern.trim()).then((p) => {
                if (live && p) setPreview(p);
            });
        }, 300);
        return () => {
            live = false;
            clearTimeout(t);
        };
    }, [pattern]);

    const rows = preview?.rows ?? [];
    const counts: Partial<Record<string, number>> = {};
    for (const r of rows) counts[r.next] = (counts[r.next] ?? 0) + 1;

    function save() {
        if (problem || !dirty) return;
        const before = saved;
        start(async () => {
            const res = await saveSkuPattern(pattern.trim(), suggest);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setSaved({ pattern: res.data.pattern, suggest: res.data.suggest });
            router.refresh();
            showUndo(
                `Pattern saved. The editor suggests ${rows[0]?.next ?? "it"}-style SKUs.`,
                () =>
                    start(async () => {
                        const undo = await saveSkuPattern(
                            before.pattern,
                            before.suggest,
                        );
                        if (!undo.ok) return showError(undo.error);
                        setSaved(before);
                        setPattern(before.pattern);
                        setSuggest(before.suggest);
                        router.refresh();
                    }),
            );
        });
    }

    return (
        <section>
            <TabIntro title="SKU pattern">
                How the editor suggests a SKU for a new product or variant. It
                is only a suggestion — the field stays editable, and SKUs you
                already have are never rewritten.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            <div className="rounded-[12px] border border-border bg-card px-4 py-3.5">
                <label className="block text-[12px] font-medium">
                    Pattern
                    <input
                        value={pattern}
                        disabled={!canWrite}
                        spellCheck={false}
                        onChange={(e) => setPattern(e.target.value)}
                        aria-invalid={!!problem}
                        className={cn(
                            "mt-[5px] block h-[38px] w-full rounded-[8px] border bg-card px-2.5 font-mono text-[13.5px] font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted/50 coarse:h-11",
                            problem ? "border-destructive" : "border-border",
                        )}
                    />
                </label>
                <div className="mt-[9px] flex flex-wrap gap-1.5">
                    {TOKENS.map((t) => (
                        <button
                            key={t.t}
                            type="button"
                            disabled={!canWrite}
                            title={t.what}
                            aria-label={`Add ${t.t}, ${t.what}`}
                            onClick={() =>
                                setPattern(
                                    (p) =>
                                        p +
                                        (p && !/[-_]$/.test(p) ? "-" : "") +
                                        t.t,
                                )
                            }
                            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 hover:bg-muted disabled:cursor-not-allowed coarse:h-11"
                        >
                            <span className="font-mono text-[12px] font-medium">
                                {t.t}
                            </span>
                            <span className="text-[11.5px] text-muted-foreground">
                                {t.what}
                            </span>
                        </button>
                    ))}
                </div>
                {problem ? (
                    <p
                        role="alert"
                        className="mt-[9px] text-[12px] leading-[1.45] text-destructive"
                    >
                        {problem}
                    </p>
                ) : null}
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={suggest}
                    disabled={!canWrite}
                    onClick={() => setSuggest((v) => !v)}
                    className="mt-3 flex items-center gap-[9px] text-left text-[12.5px] text-foreground/75 disabled:cursor-not-allowed coarse:min-h-11"
                >
                    <span
                        aria-hidden
                        className={cn(
                            "size-4 shrink-0 rounded-[4px] bg-card",
                            suggest
                                ? "border-[5px] border-foreground"
                                : "border-[1.5px] border-border-strong",
                        )}
                    />
                    Suggest SKUs in the product editor
                </button>
            </div>

            <p className="mb-2 mt-[18px] text-[12.5px] font-semibold">
                What your variants would be called
            </p>
            <div className="overflow-hidden rounded-[12px] border border-border bg-card">
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5 border-b border-border/70 px-4 py-[9px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
                    <span>Variant</span>
                    <span>Today</span>
                    <span>Suggested</span>
                </div>
                {rows.length === 0 ? (
                    <p className="px-4 py-3 text-[12.5px] text-muted-foreground">
                        {preview
                            ? "No products yet — the first one gets the pattern."
                            : "Couldn't load the preview. The pattern still saves."}
                    </p>
                ) : (
                    rows.slice(0, SHOWN).map((r, i) => (
                        <div
                            key={`${r.productId}-${i}`}
                            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-2.5 border-b border-border/70 px-4 py-[9px] last:border-b-0"
                        >
                            <span className="min-w-0 text-[13px]">
                                {r.product}
                                {r.variant ? ` · ${r.variant}` : ""}
                            </span>
                            <span className="min-w-0 break-all font-mono text-[12px] text-muted-foreground">
                                {r.now || "—"}
                            </span>
                            <span
                                className={cn(
                                    "min-w-0 break-all font-mono text-[12px] font-medium",
                                    (counts[r.next] ?? 0) > 1
                                        ? "text-destructive"
                                        : r.next === r.now
                                          ? "text-muted-foreground"
                                          : "text-foreground",
                                )}
                            >
                                {r.next || "—"}
                            </span>
                        </div>
                    ))
                )}
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
                {rows.length > SHOWN
                    ? `The first ${SHOWN} of ${rows.length} variants. Today's SKUs stay as they are.`
                    : "Today's SKUs stay as they are."}
            </p>

            {dirty && canWrite ? (
                <div className="sticky bottom-[var(--tab-bar-inset)] z-10 mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-highlight bg-muted px-3.5 py-2.5">
                    <span
                        role="status"
                        className={cn(
                            "flex-[1_1_200px] text-[12.5px]",
                            problem ? "text-destructive" : "text-foreground/75",
                        )}
                    >
                        {problem ||
                            (suggest
                                ? `New products get SKUs like ${rows[0]?.next ?? "…"}.`
                                : "The editor stops suggesting SKUs.")}
                    </span>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                            setPattern(saved.pattern);
                            setSuggest(saved.suggest);
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
                        {pending ? "Saving…" : "Save pattern"}
                    </button>
                </div>
            ) : null}
        </section>
    );
}
