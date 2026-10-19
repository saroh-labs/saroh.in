"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useMemo, useRef } from "react";

import { EmptyPanel } from "@/components/states/empty-panel";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { usePlansNav } from "../plans-nav";
import type { DraftChange } from "./changes";
import { draftChanges, reachOf } from "./changes";

/**
 * "Changes in this draft" (admin redesign U13, R18, R24): each change the
 * draft makes to live, with who it reaches and its own Undo, which takes
 * back that one change and nothing else. Docked beside the pricing table it
 * is a short list; on Review and publish each change also names its plan
 * and has Edit, which opens where it is changed.
 *
 * Undo is a draft edit like any other: no toast (R9), the line leaves the
 * list and the keyboard moves to the next line's Undo, or to the list.
 */
export function ChangeList({ variant }: { variant: "docked" | "review" }) {
    const { live, catalog, edit, canEdit, save, impact } = useDraft();
    const { pricing } = usePlans();
    const { setTab } = usePlansNav();
    const listRef = useRef<HTMLDivElement>(null);
    // Which line's Undo was pressed: once the list has redrawn without it,
    // the keyboard moves to the Undo now in its place, or to the list.
    const refocus = useRef<number | null>(null);

    const changes = useMemo(
        () => draftChanges(live?.catalog ?? null, catalog),
        [live, catalog],
    );

    useEffect(() => {
        const at = refocus.current;
        const list = listRef.current;
        if (at === null || !list) return;
        refocus.current = null;
        const undos =
            list.querySelectorAll<HTMLButtonElement>("button[data-undo]");
        const next = undos.item(
            Math.min(at, undos.length - 1),
        ) as HTMLButtonElement | null;
        (next ?? list).focus();
    }, [changes]);

    // A first version has nothing to differ from.
    if (!live) return null;
    const review = variant === "review";
    const mayUndo = canEdit && save !== "conflict";

    function undo(change: DraftChange, index: number) {
        if (!change.undo) return;
        const take = change.undo;
        refocus.current = index;
        edit((c) => take(c));
    }

    return (
        <section
            aria-label="Changes in this draft"
            className={cn(
                "grid content-start gap-2",
                review &&
                    "rounded-[14px] border border-border-strong bg-background p-4",
            )}
        >
            <h3
                className={cn(
                    "font-semibold",
                    review ? "font-display text-base" : "text-[13px]",
                )}
            >
                {review ? "What changes" : "Changes in this draft"}
            </h3>
            <div
                ref={listRef}
                tabIndex={-1}
                className="grid focus-visible:outline-none"
            >
                {changes.length === 0 ? (
                    <EmptyPanel
                        size="inline"
                        title="No changes yet"
                        description="Nothing differs from the live version."
                    />
                ) : (
                    <ul className="grid">
                        {changes.map((c, i) => (
                            <li
                                key={c.key}
                                className={cn(
                                    "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border first:border-t-0",
                                    review ? "py-3" : "py-2",
                                )}
                            >
                                {review && (
                                    <Badge
                                        variant={c.plan ? "info" : "neutral"}
                                        className="flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                    >
                                        {c.plan ?? "Every plan"}
                                    </Badge>
                                )}
                                <span className="grid min-w-0 flex-[1_1_200px] gap-0.5">
                                    <span
                                        data-change=""
                                        className={cn(
                                            review
                                                ? "font-semibold"
                                                : "text-[12.5px]",
                                        )}
                                    >
                                        {c.what}
                                    </span>
                                    <span className="text-[12px] text-muted-foreground">
                                        {reachOf(c, pricing.plans, impact)}
                                    </span>
                                </span>
                                <span className="flex gap-1">
                                    {review && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-[30px] rounded-[8px] px-2.5 text-[12.5px]"
                                            aria-label={`Edit: ${c.what}`}
                                            onClick={() =>
                                                setTab(c.edit.tab, c.edit.focus)
                                            }
                                        >
                                            Edit
                                        </Button>
                                    )}
                                    {mayUndo && c.undo && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            data-undo=""
                                            className="h-[30px] rounded-[8px] px-2.5 text-[12.5px]"
                                            aria-label={`Undo: ${c.what}`}
                                            onClick={() => undo(c, i)}
                                        >
                                            Undo
                                        </Button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
