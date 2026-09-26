"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    dismissToasts,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { countSaved } from "@/lib/stock/levels";
import type { LogKindId } from "@/lib/stock/log";
import { countDraft, parseCountKey, stockSubline } from "@/lib/stock/screen";
import { countStock, undoStock } from "@/lib/stock/screen-actions";
import type { StockChecks, StockLevels, StockLog } from "@/lib/stock/service";

import { ChecksList } from "./checks-list";
import { CountBar } from "./count-bar";
import { EntrySheet } from "./entry-sheet";
import { LevelsPanel } from "./levels-panel";
import { LogList } from "./log-list";
import { MoveDialog } from "./move-dialog";
import { StockHeader } from "./stock-header";

type Tab = "levels" | "log" | "checks";

/**
 * Sell › Stock (#527, #521), after "Saroh Stock": the header with Move stock
 * and Count stock, the three tabs, and the count in progress. The tabs and
 * filters are addresses; the count is this screen's own state until saved.
 */
export function StockScreen({
    business,
    tab,
    show,
    q,
    levels,
    needsYou,
    storefronts,
    checks,
    log,
    logFilter,
    products,
    canWrite,
    pageSizes,
}: {
    business: string | null;
    tab: Tab;
    show: string;
    q: string;
    levels: StockLevels;
    needsYou: number;
    storefronts: { id: string; name: string }[];
    checks: StockChecks | "failed";
    log: StockLog | "failed" | null;
    logFilter: { kind: LogKindId; store: string; product: string };
    products: { id: string; name: string }[];
    canWrite: boolean;
    pageSizes: { levels: number; log: number; checks: number };
}) {
    const router = useRouter();
    const [counting, setCounting] = useState(false);
    const [values, setValues] = useState<Record<string, string>>({});
    const [logSays, setLogSays] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState(false);
    const [moving, setMoving] = useState(false);
    const [recording, setRecording] = useState(false);
    const attempt = useRef<string | null>(null);

    /** This screen's address with some of its parts changed. */
    const { kind, store, product } = logFilter;
    const href = useCallback(
        (change: Record<string, string | undefined>) => {
            const parts: Record<string, string | undefined> = {
                tab: tab === "levels" ? undefined : tab,
                show: show === "all" ? undefined : show,
                q: q || undefined,
                kind: kind === "all" ? undefined : kind,
                store: store === "all" ? undefined : store,
                product: product || undefined,
                ...change,
            };
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(parts)) {
                if (v) params.set(k, v);
            }
            const s = params.toString();
            return s ? `/commerce/stock?${s}` : "/commerce/stock";
        },
        [tab, show, q, kind, store, product],
    );

    const draft = countDraft(values, logSays);

    const startCount = () => {
        setValues({});
        setLogSays({});
        attempt.current = null;
        setCounting(true);
        if (tab !== "levels") router.push(href({ tab: undefined }));
    };
    const cancelCount = () => {
        setCounting(false);
        setValues({});
        setLogSays({});
    };

    const saveCount = async () => {
        if (!draft.entered.length || draft.bad) return;
        attempt.current ??= crypto.randomUUID();
        setSaving(true);
        const res = await countStock({
            counts: draft.entered.map((e) => ({
                ...parseCountKey(e.key),
                expected: e.expected,
                counted: e.counted,
            })),
            idempotencyKey: attempt.current,
        });
        setSaving(false);
        if (!res.ok) {
            // The count stays on screen to fix and save again.
            showError(res.error);
            attempt.current = null;
            return;
        }
        const { counted, changed, mismatched, entryIds, results } = res.data;
        const short = results.filter((r) => r.shelf.short > 0);
        const notes = [
            short.length > 0
                ? `${short.length} ${short.length === 1 ? "shelf is" : "shelves are"} now short for orders already placed.`
                : null,
            mismatched > 0
                ? `${mismatched} didn't match — the shelf moved while you counted. See Checks.`
                : null,
        ].filter(Boolean);
        cancelCount();
        attempt.current = null;
        dismissToasts();
        showUndo(
            countSaved(counted, changed),
            () => {
                void undoStock({
                    entryIds,
                    idempotencyKey: crypto.randomUUID(),
                }).then((u) => {
                    if (!u.ok) {
                        showError(u.error);
                        return;
                    }
                    showSuccess("Count undone.");
                    router.refresh();
                });
            },
            notes.length ? { description: notes.join(" ") } : {},
        );
        router.refresh();
    };

    const onValue = useCallback((key: string, raw: string, said: number) => {
        setValues((v) => ({ ...v, [key]: raw }));
        setLogSays((l) => (l[key] === said ? l : { ...l, [key]: said }));
    }, []);

    const checkCount =
        checks === "failed"
            ? null
            : Object.values(checks.counts).reduce((a, b) => a + b, 0);
    const tabs: {
        id: Tab;
        label: string;
        meta?: { text: string; tone: "plain" | "attention" | "danger" };
    }[] = [
        {
            id: "levels",
            label: "Levels",
            meta:
                needsYou > 0
                    ? { text: `${needsYou} need you`, tone: "attention" }
                    : undefined,
        },
        { id: "log", label: "Log" },
        {
            id: "checks",
            label: "Checks",
            meta:
                checkCount === null
                    ? { text: "Couldn't load", tone: "danger" }
                    : checkCount > 0
                      ? { text: String(checkCount), tone: "danger" }
                      : undefined,
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <StockHeader
                subline={stockSubline(business, storefronts)}
                actions={
                    canWrite ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-[9px] px-3.5 text-[12.5px]"
                                onClick={() => setRecording(true)}
                            >
                                Record stock
                            </Button>
                            {storefronts.length > 1 ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-[9px] px-3.5 text-[12.5px]"
                                    onClick={() => setMoving(true)}
                                >
                                    Move stock
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                className="rounded-[9px] px-4 text-[12.5px]"
                                disabled={counting}
                                onClick={startCount}
                            >
                                Count stock
                            </Button>
                        </>
                    ) : undefined
                }
            />

            <nav
                aria-label="Stock views"
                className="-mx-1 flex gap-0.5 overflow-x-auto border-b border-border px-1"
            >
                {tabs.map((t) => {
                    const on = t.id === tab;
                    return (
                        <Link
                            key={t.id}
                            href={href({
                                tab: t.id === "levels" ? undefined : t.id,
                            })}
                            scroll={false}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                                "flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-t-md px-3 py-2.5 text-[13px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t.label}
                            {t.meta ? (
                                <span
                                    className={cn(
                                        "rounded-full px-[7px] py-px text-[11px] font-semibold tabular-nums",
                                        t.meta.tone === "attention" &&
                                            "bg-brand-subtle text-brand-subtle-foreground",
                                        t.meta.tone === "danger" &&
                                            "bg-destructive-subtle text-destructive-subtle-foreground",
                                        t.meta.tone === "plain" &&
                                            "bg-muted text-muted-foreground",
                                    )}
                                >
                                    {t.meta.text}
                                </span>
                            ) : null}
                        </Link>
                    );
                })}
            </nav>

            <div className="flex flex-col gap-3.5">
                {tab === "levels" ? (
                    <>
                        {counting ? (
                            <div
                                role="note"
                                className="flex flex-wrap items-baseline gap-2.5 rounded-[10px] bg-brand-subtle px-3.5 py-[11px] text-[13px] leading-normal text-brand-subtle-foreground"
                            >
                                <strong>Counting.</strong>
                                <span className="flex-[1_1_280px] text-pretty">
                                    Type what&apos;s on the shelf. Leave a box
                                    empty to skip it. Saroh records the gap
                                    between what the log expected and what you
                                    counted.
                                </span>
                            </div>
                        ) : null}
                        <LevelsPanel
                            levels={levels}
                            allStorefronts={storefronts}
                            needsYou={needsYou}
                            show={show}
                            q={q}
                            href={href}
                            counting={counting}
                            values={values}
                            onValue={onValue}
                            pageSize={pageSizes.levels}
                        />
                    </>
                ) : null}
                {tab === "log" && log ? (
                    <LogList
                        log={log}
                        filter={logFilter}
                        storefronts={storefronts}
                        products={products}
                        href={href}
                        pageSize={pageSizes.log}
                    />
                ) : null}
                {tab === "checks" ? (
                    <ChecksList checks={checks} pageSize={pageSizes.checks} />
                ) : null}
            </div>

            {counting && tab === "levels" ? (
                <CountBar
                    status={draft.status}
                    canSave={draft.entered.length > 0 && !draft.bad}
                    saving={saving}
                    onCancel={cancelCount}
                    onSave={() => void saveCount()}
                />
            ) : null}

            {canWrite ? (
                <>
                    {moving && storefronts.length > 1 ? (
                        <MoveDialog
                            open={moving}
                            onOpenChange={setMoving}
                            storefronts={storefronts}
                        />
                    ) : null}
                    {recording ? (
                        <EntrySheet
                            open={recording}
                            onOpenChange={setRecording}
                            storefronts={storefronts}
                        />
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
