"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showInfo, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { CrmResult } from "@/lib/api/http";
import type { Hold } from "@/lib/hold-undo";
import { HOLD_UNDO_MS, secondsLeft, startHold } from "@/lib/hold-undo";
import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";
import { useClock } from "@/lib/hooks/use-clock";
import type { BulkAction, StageBatch } from "@/lib/orders/bulk";
import {
    anyMoved,
    bulkActions,
    commitSummary,
    holdTitle,
    holdWho,
    selectionLabel,
    undoSummary,
} from "@/lib/orders/bulk";
import { holdBatch, sendBatchNow, undoBatch } from "@/lib/orders/bulk-actions";
import type { OrderRow } from "@/lib/orders/business-service";

/**
 * The Orders list's bulk bar and its held batch (plan B, B6), after the
 * "Saroh Orders Screen" design: the ink bar while rows are selected, with
 * the steps the selection can take and how many, and — for Mark ready — the
 * Saffron card counting down ten seconds with Undo all and Send now.
 *
 * The server holds the batch (`lib/orders/bulk-actions.ts`) and commits it
 * itself, so leaving the page loses nothing: the page's clock is the shared
 * hold (`lib/hold-undo.ts`, `onLeave: "drop"`). Start preparing and the
 * handover go through at once, with Undo all on the toast, as the design
 * has them. Every result is said in words: what moved, what couldn't and
 * why, and whether a customer had already been told.
 *
 * The bar sticks to the foot of the screen, so it lifts the toasts above
 * itself (`useBottomBarInset`): "3 orders preparing · Undo all" never lands
 * on the bar's own buttons.
 */

interface Held {
    batchId: string;
    count: number;
    names: string[];
    skipped: number;
    until: number;
}

const BAR_BUTTON =
    "h-8 cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold transition-[background-color,transform] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground active:scale-[0.97] coarse:h-11";

const HOLD_BUTTON =
    "h-[30px] cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold transition-[background-color,transform] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] coarse:h-11";

export function BulkBar({
    selected,
    onClear,
}: {
    /** The selected rows on this page. */
    selected: OrderRow[];
    onClear: () => void;
}) {
    const router = useRouter();
    const [busy, startTransition] = useTransition();
    const [held, setHeld] = useState<Held | null>(null);
    const hold = useRef<Hold | null>(null);
    const bar = useRef<HTMLDivElement>(null);
    useBottomBarInset(bar, held !== null || selected.length > 0);

    // Leaving the page drops the local clock; the server still commits.
    useEffect(
        () => () => {
            void hold.current?.leave();
        },
        [],
    );

    const { actions, note } = bulkActions(selected, held !== null);

    function nameMap(action: BulkAction) {
        const names = new Map(
            action.lines.map((l, i) => [l.orderId, action.names[i] ?? ""]),
        );
        return (orderId: string) => names.get(orderId) ?? "Someone";
    }

    /** The batch went through: say what it did, with Undo all. */
    function reportCommit(
        res: CrmResult<StageBatch>,
        action: BulkAction,
    ): void {
        router.refresh();
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const said = commitSummary(res.data, action.kind, action.skipped);
        if (!anyMoved(res.data)) {
            showInfo(said);
            return;
        }
        const batchId = res.data.id;
        const nameOf = nameMap(action);
        showUndo(
            said,
            () =>
                startTransition(async () => {
                    const back = await undoBatch(batchId);
                    if (!back.ok) showError(back.error);
                    else showInfo(undoSummary(back.data, nameOf));
                    router.refresh();
                }),
            { duration: HOLD_UNDO_MS },
        );
    }

    /** Post the batch; one retry with the same id if the reply was lost. */
    async function post(action: BulkAction, batchId: string, now: boolean) {
        const input = { batchId, lines: action.lines, now };
        try {
            return await holdBatch(input);
        } catch {
            return holdBatch(input);
        }
    }

    function run(action: BulkAction) {
        if (action.disabled || busy) return;
        const batchId = crypto.randomUUID();
        startTransition(async () => {
            const res = await post(action, batchId, !action.hold);
            if (!res.ok) {
                showError(res.error);
                router.refresh();
                return;
            }
            onClear();
            if (!action.hold) {
                reportCommit(res, action);
                return;
            }
            const nameOf = nameMap(action);
            const started = startHold({
                onLeave: "drop",
                commit: async () => {
                    reportCommit(await sendBatchNow(batchId), action);
                },
                undo: async () => {
                    const back = await undoBatch(batchId);
                    if (!back.ok) throw new Error(back.error);
                    showInfo(undoSummary(back.data, nameOf));
                    router.refresh();
                },
                onChange: (state) => {
                    if (state.status === "held") return;
                    if (state.status === "failed") {
                        showError(
                            state.error instanceof Error
                                ? state.error.message
                                : "That didn't go through. Try again.",
                        );
                    }
                    if (
                        state.status !== "committing" &&
                        state.status !== "undoing"
                    ) {
                        setHeld(null);
                        hold.current = null;
                    }
                },
            });
            hold.current = started;
            setHeld({
                batchId,
                count: action.lines.length,
                names: action.names,
                skipped: action.skipped,
                until: Date.now() + HOLD_UNDO_MS,
            });
        });
    }

    if (!held && selected.length === 0) return null;

    return (
        <div
            ref={bar}
            className="pointer-events-none sticky bottom-[22px] z-20 flex flex-col-reverse gap-2.5 pt-3.5 max-[759px]:bottom-[74px]"
        >
            {selected.length > 0 ? (
                <div
                    role="region"
                    aria-label="Selected orders"
                    className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-[11px] bg-primary px-[15px] py-[11px] text-primary-foreground shadow-lg"
                >
                    <span className="text-[13px] font-semibold">
                        {selectionLabel(selected.length)}
                    </span>
                    {note ? (
                        <span className="text-[11.5px] opacity-80">{note}</span>
                    ) : null}
                    <div className="ml-auto flex flex-wrap gap-[7px]">
                        {actions.map((action) => (
                            <button
                                key={action.kind}
                                type="button"
                                onClick={() => run(action)}
                                disabled={action.disabled !== null || busy}
                                aria-disabled={action.disabled !== null}
                                title={action.disabled ?? action.title}
                                className={cn(
                                    BAR_BUTTON,
                                    "border border-primary-foreground/30 hover:bg-primary-foreground/10 active:bg-primary-foreground/15 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:active:scale-100",
                                )}
                            >
                                {action.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={onClear}
                            className={cn(
                                BAR_BUTTON,
                                "px-2.5 font-medium opacity-80 hover:bg-primary-foreground/10 hover:opacity-100 active:bg-primary-foreground/15",
                            )}
                        >
                            Clear
                        </button>
                    </div>
                </div>
            ) : null}
            {held ? (
                <HeldCard
                    held={held}
                    onUndo={() => void hold.current?.undo()}
                    onNow={() => void hold.current?.commitNow()}
                />
            ) : null}
        </div>
    );
}

/** The Saffron card: "Marking 3 ready in 8s", Undo all, Send now, the bar. */
function HeldCard({
    held,
    onUndo,
    onNow,
}: {
    held: Held;
    onUndo: () => void;
    onNow: () => void;
}) {
    const now = useClock(250);
    const left = now === null ? HOLD_UNDO_MS : Math.max(0, held.until - now);
    return (
        <div
            role="status"
            className="pointer-events-auto rounded-[11px] border border-highlight-border bg-brand-subtle px-[15px] py-[11px] shadow-lg"
        >
            <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex-[1_1_220px] text-[13px] font-semibold tabular-nums text-brand-subtle-foreground">
                    {holdTitle(held.count, secondsLeft(left))}
                </span>
                <button
                    type="button"
                    onClick={onUndo}
                    className={cn(
                        HOLD_BUTTON,
                        "border border-highlight-border bg-card hover:bg-muted active:bg-muted/80",
                    )}
                >
                    Undo all
                </button>
                <button
                    type="button"
                    onClick={onNow}
                    className={cn(
                        HOLD_BUTTON,
                        "text-brand-subtle-foreground hover:bg-highlight-border/30 active:bg-highlight-border/45",
                    )}
                >
                    Send now
                </button>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
                {holdWho(held.names, held.skipped)}
            </p>
            <div
                aria-hidden
                className="mt-2 h-[3px] rounded-full bg-foreground/5"
            >
                <div
                    className="h-[3px] rounded-full bg-highlight transition-[width] duration-200 ease-linear"
                    style={{ width: `${(left / HOLD_UNDO_MS) * 100}%` }}
                />
            </div>
        </div>
    );
}
