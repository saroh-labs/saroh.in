"use client";

import { count as countOf, plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { dismissToasts, showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { useLeaveGuard } from "@/components/shared/use-leave-guard";
import { countSaved } from "@/lib/stock/levels";
import type { LogKindId } from "@/lib/stock/log";
import {
    countDraft,
    parseCountKey,
    STOCK_UNREACHABLE,
    stockSubline,
} from "@/lib/stock/screen";
import { countStock, undoStock } from "@/lib/stock/screen-actions";
import type { StockChecks, StockLevels, StockLog } from "@/lib/stock/service";

import { Notice } from "@saroh/ui/notice";
import { TabStrip } from "@saroh/ui/tabs";
import { ChecksList } from "./checks-list";
import { CountBar } from "./count-bar";
import { EntrySheet } from "./entry-sheet";
import { LevelsPanel } from "./levels-panel";
import { LogList } from "./log-list";
import { MoveDialog } from "./move-dialog";

import { useCountMode } from "./use-count-mode";

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

    // Cancel offers Undo, which puts the typed numbers back (`useCountMode`).
    const count = useCountMode({
        onBack: () => {
            if (tab !== "levels") router.push(href({ tab: undefined }));
        },
    });
    const { counting, values, logSays, onValue } = count;
    const draft = countDraft(values, logSays);
    // The tabs, filters and pages are this screen at another address and
    // keep the count; any other way out would lose it.
    const guard = useLeaveGuard({
        dirty: counting && count.typed > 0 && !saving,
        lost: "The count isn't saved yet, so the numbers you've typed will be lost.",
        keeps: (to) => to.pathname === "/commerce/stock",
    });

    const startCount = () => {
        attempt.current = null;
        count.start();
    };

    const saveCount = async () => {
        if (!draft.entered.length || draft.bad) return;
        attempt.current ??= crypto.randomUUID();
        setSaving(true);
        let res: Awaited<ReturnType<typeof countStock>>;
        try {
            res = await countStock({
                counts: draft.entered.map((e) => ({
                    ...parseCountKey(e.key),
                    expected: e.expected,
                    counted: e.counted,
                })),
                idempotencyKey: attempt.current,
            });
        } catch {
            // The count stays on screen, and its key with it: a retry of
            // one that landed isn't counted twice.
            showError(STOCK_UNREACHABLE);
            return;
        } finally {
            setSaving(false);
        }
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
                ? `${countOf(short.length, "shelf is", "shelves are")} now short for orders already placed.`
                : null,
            mismatched > 0
                ? `${mismatched} didn't match because the shelf moved while you counted. See Checks.`
                : null,
        ].filter(Boolean);
        count.clear();
        attempt.current = null;
        dismissToasts();
        showUndo(
            countSaved(counted, changed),
            async () => {
                const u = await undoStock({
                    entryIds,
                    idempotencyKey: crypto.randomUUID(),
                });
                router.refresh();
                return u;
            },
            notes.length ? { description: notes.join(" ") } : {},
        );
        router.refresh();
    };

    const checkCount =
        checks === "failed"
            ? null
            : Object.values(checks.counts).reduce((a, b) => a + b, 0);
    // Both counts mean "this needs you now", so both wear the one
    // attention tone (Ink) and say so in their name: how many lines are
    // running low, how many checks are open. Checks that couldn't be read
    // are a dash, never 0.
    const tabs: {
        id: Tab;
        label: string;
        count?: number | null;
        tone?: "strong";
        says?: string;
    }[] = [
        {
            id: "levels",
            label: "Levels",
            count: needsYou > 0 ? needsYou : undefined,
            tone: "strong",
            says: plural(needsYou, "needs you", "need you"),
        },
        { id: "log", label: "Log" },
        {
            id: "checks",
            label: "Checks",
            count:
                checkCount === null
                    ? null
                    : checkCount > 0
                      ? checkCount
                      : undefined,
            tone: "strong",
            says: plural(checkCount ?? 0, "check needs you", "checks need you"),
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <PageHeader
                holdsData="description"
                className="mb-0"
                breadcrumb={["Sell", "Stock"]}
                title="Stock"
                description={stockSubline(business, storefronts) || undefined}
                actions={
                    canWrite ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRecording(true)}
                            >
                                Record stock
                            </Button>
                            {storefronts.length > 1 ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setMoving(true)}
                                >
                                    Move stock
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                disabled={counting}
                                onClick={startCount}
                            >
                                Count stock
                            </Button>
                        </>
                    ) : undefined
                }
            />

            <TabStrip
                label="Stock views"
                value={tab}
                tabs={tabs.map((t) => ({
                    value: t.id,
                    label: t.label,
                    href: href({ tab: t.id === "levels" ? undefined : t.id }),
                    count: t.count,
                    countTone: t.tone,
                    countSays: t.says,
                }))}
            />

            <div className="flex flex-col gap-3.5">
                {tab === "levels" ? (
                    <>
                        {counting ? (
                            <Notice tone="info" role="note">
                                <div className="flex flex-wrap items-baseline gap-2.5">
                                    <strong>Counting.</strong>
                                    <span className="flex-[1_1_280px] text-pretty">
                                        Type what&apos;s on the shelf. Leave a
                                        box empty to skip it. Saroh records the
                                        gap between what the log expected and
                                        what you counted.
                                    </span>
                                </div>
                            </Notice>
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
                    onCancel={count.cancel}
                    onSave={() => void saveCount()}
                />
            ) : null}
            {guard.dialog}

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
