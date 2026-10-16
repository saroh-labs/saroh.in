"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { SkuPreview, SkuSettings } from "@/lib/products/settings";
import {
    previewSkuPattern,
    saveSkuPattern,
} from "@/lib/products/settings-actions";
import { patternProblem } from "@/lib/products/sku-pattern";

import { CheckRow } from "@/components/shared/check-row";
import { listTable } from "@/components/shared/list-toolbar";
import { runAction } from "@/lib/api/run-action";
import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Tip } from "@saroh/ui/tooltip";
import { SettingsReadOnly, TabIntro, useUnsaved } from "./product-settings";

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
 * names every variant as the pattern would. Two that come out alike are
 * advice, never a block: the editor adds -2, -3 to tell them apart, so Save
 * is always there. A pattern that is wrong on its own is said only once it
 * has been changed, and turning suggestions off never checks it.
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
    const { report } = useUnsaved();
    const [saved, setSaved] = useState({
        pattern: settings.pattern,
        suggest: settings.suggest,
    });
    const [pattern, setPattern] = useState(settings.pattern);
    const [suggest, setSuggest] = useState(settings.suggest);
    const [preview, setPreview] = useState(initialPreview);
    const [pending, start] = useTransition();
    const field = useRef<HTMLInputElement>(null);

    const touched = pattern !== saved.pattern;
    const changed = (touched ? 1 : 0) + (suggest !== saved.suggest ? 1 : 0);
    const dirty = changed > 0;
    const saveBar = useRef<HTMLDivElement>(null);
    useBottomBarInset(saveBar, dirty && canWrite);
    // Only a pattern the owner changed can be wrong on screen, and only
    // while it is used: with suggestions off, Save keeps the saved one.
    const problem = touched && suggest ? patternProblem(pattern) : "";
    const advice = problem ? "" : (preview?.advice ?? "");

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

    /** Resolves true once saved; the leave guard's Save and leave too. */
    async function persist(): Promise<boolean> {
        if (!dirty) return true;
        if (problem) {
            field.current?.focus();
            return false;
        }
        const before = saved;
        // Off, a pattern that is wrong on its own isn't sent: the saved one stays.
        const next = patternProblem(pattern) ? saved.pattern : pattern.trim();
        const res = await runAction(() => saveSkuPattern(next, suggest));
        if (!res) return false;
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        setSaved({ pattern: res.data.pattern, suggest: res.data.suggest });
        setPattern(res.data.pattern);
        router.refresh();
        showUndo(
            res.data.suggest
                ? `Saved. The editor suggests ${rows[0]?.next ?? "them"}-style SKUs.`
                : "Saved. The editor stops suggesting SKUs.",
            () =>
                start(async () => {
                    const undo = await runAction(() =>
                        saveSkuPattern(before.pattern, before.suggest),
                    );
                    if (!undo) return;
                    if (!undo.ok) return showError(undo.error);
                    setSaved(before);
                    setPattern(before.pattern);
                    setSuggest(before.suggest);
                    router.refresh();
                }),
        );
        return true;
    }

    const persistRef = useRef(persist);
    useEffect(() => {
        persistRef.current = persist;
    });
    useEffect(() => {
        report(changed, () => persistRef.current());
        return () => report(0);
    }, [changed, report]);

    function save() {
        start(async () => {
            await persist();
        });
    }

    return (
        <section>
            <TabIntro title="SKUs">
                How the editor suggests a SKU for a new product or variant. It
                is only a suggestion. The field stays editable, and SKUs you
                already have are never rewritten.
            </TabIntro>
            {canWrite ? null : <SettingsReadOnly />}

            <div className="rounded-[12px] border border-border bg-card px-4 py-3.5">
                <Field label="Pattern" className="space-y-[5px]">
                    <Input
                        ref={field}
                        value={pattern}
                        disabled={!canWrite}
                        spellCheck={false}
                        onChange={(e) => setPattern(e.target.value)}
                        aria-invalid={!!problem}
                        className="font-mono"
                    />
                </Field>
                <div className="mt-[9px] flex flex-wrap gap-1.5">
                    {TOKENS.map((t) => (
                        <Tip key={t.t} label={t.what}>
                            <button
                                type="button"
                                disabled={!canWrite}
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
                        </Tip>
                    ))}
                </div>
                {problem ? (
                    <p
                        role="alert"
                        className="mt-[9px] text-[12px] leading-[1.45] text-destructive"
                    >
                        {problem}
                    </p>
                ) : advice && suggest ? (
                    <p
                        role="status"
                        className="mt-[9px] text-pretty text-[12px] leading-[1.45] text-foreground/75"
                    >
                        {advice}
                    </p>
                ) : null}
                <CheckRow
                    checked={suggest}
                    disabled={!canWrite}
                    onChange={setSuggest}
                    className="mt-3 gap-[9px] text-[12.5px] text-foreground/75"
                >
                    Suggest SKUs in the product editor
                </CheckRow>
            </div>

            <p className="mb-2 mt-[18px] text-[12.5px] font-semibold">
                What your variants would be called
            </p>
            <div data-list-table="" className={listTable.card}>
                <div
                    data-list-head=""
                    className={cn(
                        listTable.head,
                        "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5",
                    )}
                >
                    <span>Variant</span>
                    <span>Today</span>
                    <span>Suggested</span>
                </div>
                {!preview ? (
                    // The preview is this tab's own read, so Try again asks
                    // for it again: refreshing the page would not.
                    <FailedRead
                        className="px-4 py-3"
                        things="the preview"
                        reassurance="The pattern still saves."
                        onRetry={() => {
                            void previewSkuPattern(pattern.trim()).then((p) => {
                                if (p) setPreview(p);
                            });
                        }}
                    />
                ) : rows.length === 0 ? (
                    <EmptyState
                        size="inline"
                        className="px-4 py-3"
                        title="No products yet"
                        description="The first one gets the pattern."
                    />
                ) : (
                    rows.slice(0, SHOWN).map((r, i) => (
                        <div
                            key={`${r.productId}-${i}`}
                            className={cn(
                                listTable.rowStill,
                                "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-2.5",
                            )}
                        >
                            <span className="min-w-0 text-[13px]">
                                {r.product}
                                {r.variant ? ` · ${r.variant}` : ""}
                            </span>
                            <span className="min-w-0 break-all font-mono text-[12px] text-muted-foreground">
                                {r.now || <AbsentValue says="None" />}
                            </span>
                            <span
                                className={cn(
                                    "min-w-0 break-all font-mono text-[12px] font-medium",
                                    r.next === r.now
                                        ? "text-muted-foreground"
                                        : "text-foreground",
                                )}
                            >
                                {r.next || <AbsentValue says="None" />}
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
                <div
                    ref={saveBar}
                    className="sticky bottom-[var(--tab-bar-inset)] z-10 mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-border-strong bg-muted px-3.5 py-2.5"
                >
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
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={pending}
                        onClick={() => {
                            setPattern(saved.pattern);
                            setSuggest(saved.suggest);
                        }}
                    >
                        Discard
                    </Button>
                    <Button
                        size="sm"
                        type="button"
                        onClick={save}
                        busy={pending}
                        busyLabel="Saving…"
                    >
                        Save
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
