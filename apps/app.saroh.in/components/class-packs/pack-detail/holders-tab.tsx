"use client";

import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { MAX_EXTEND_DAYS } from "@/lib/class-packs/pack-detail";
import type { HolderRow } from "@/lib/class-packs/pack-holders";

const BAR = {
    ok: "bg-success",
    soon: "bg-highlight",
    ended: "bg-muted-foreground",
} as const;

const WHEN = {
    soon: "text-brand",
    lost: "text-destructive",
    plain: "text-foreground/80",
} as const;

/** Why Extend is off for everyone: the role, said once per row. */
const NO_EXTEND = "Your role can't extend packs";

/**
 * Pack Detail's Who has it (E16, after the design): who can still use the
 * pack and whose has ended, each with what is left, the use-by date, any
 * extensions and what they paid — and Extend, 1 to 30 days with a reason.
 *
 * `rows` is null when they couldn't be read: said here, in this tab only.
 * Nobody ever having bought it is the empty state, with Sell this pack.
 */
export function HoldersTab({
    rows,
    denied,
    unitsWord,
    emptyLive,
    canExtend,
    sellable,
    onSell,
    onExtend,
    onRetry,
}: {
    rows: { live: HolderRow[]; done: HolderRow[] } | null;
    /** The holders read was refused for this role. */
    denied: boolean;
    /** "classes" or "sessions". */
    unitsWord: string;
    emptyLive: string;
    canExtend: boolean;
    /** Sell at the desk is open to this person and the pack is on sale. */
    sellable: boolean;
    onSell: () => void;
    onExtend: (row: HolderRow) => void;
    onRetry: () => void;
}) {
    const [which, setWhich] = useState<"live" | "done">(
        rows?.live.length === 0 && rows.done.length > 0 ? "done" : "live",
    );
    const panelId = useId();

    const head = (
        <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
            <h2 className="m-0 font-display text-[15px] font-semibold tracking-[-0.015em]">
                Who has it
            </h2>
            <span className="text-[12px] text-muted-foreground">
                Extend a use-by date by up to {MAX_EXTEND_DAYS} days at a time,
                with a reason — it&apos;s kept with their pack.
            </span>
        </div>
    );

    if (denied) {
        return (
            <>
                {head}
                <PermissionDeniedState
                    title="You can't see who has this pack"
                    description="Your role doesn't reach the people holding packs."
                    note="An owner or admin can change what your role reaches in Team."
                />
            </>
        );
    }
    if (!rows) {
        return (
            <>
                {head}
                <FailedState
                    title="Who has it could not be loaded"
                    description="This tab couldn't read who holds the pack. Nothing has changed — everyone still has the classes they had."
                    action={
                        <Button variant="outline" onClick={onRetry}>
                            Try again
                        </Button>
                    }
                />
            </>
        );
    }
    if (rows.live.length === 0 && rows.done.length === 0) {
        return (
            <>
                {head}
                <EmptyState
                    icon={<Users />}
                    title="Nobody has this pack yet"
                    description={`Once it's sold, each person shows here with the ${unitsWord} they have left and when they run out.`}
                    action={
                        sellable ? (
                            <Button onClick={onSell}>Sell this pack</Button>
                        ) : undefined
                    }
                />
            </>
        );
    }

    const list = which === "live" ? rows.live : rows.done;
    const segments = [
        { key: "live", label: `Can still use · ${rows.live.length}` },
        { key: "done", label: `Used up or expired · ${rows.done.length}` },
    ] as const;

    return (
        <>
            {head}
            <div
                role="tablist"
                aria-label="Who has it"
                className="mt-2.5 flex max-w-[420px] gap-0.5 rounded-[9px] bg-muted p-[3px]"
            >
                {segments.map((s) => {
                    const on = which === s.key;
                    return (
                        <button
                            key={s.key}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-controls={panelId}
                            onClick={() => setWhich(s.key)}
                            className={cn(
                                "flex-1 cursor-pointer rounded-[7px] px-2.5 py-[7px] text-[13px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "bg-card text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground active:bg-accent-active",
                            )}
                        >
                            {s.label}
                        </button>
                    );
                })}
            </div>
            <div id={panelId} role="tabpanel">
                {list.length === 0 ? (
                    <p className="pb-1 pt-3.5 text-[13px] text-muted-foreground">
                        {which === "live" ? emptyLive : "Nothing finished yet."}
                    </p>
                ) : (
                    <ul className="mt-2 grid">
                        {list.map((r) => (
                            <HolderItem
                                key={r.purchaseId}
                                row={r}
                                canExtend={canExtend}
                                onExtend={() => onExtend(r)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}

function HolderItem({
    row,
    canExtend,
    onExtend,
}: {
    row: HolderRow;
    canExtend: boolean;
    onExtend: () => void;
}) {
    const whyId = useId();
    const why = canExtend ? row.extendBlock : NO_EXTEND;
    return (
        <li className="flex flex-wrap items-center gap-3.5 border-t border-border/70 py-3">
            <div className="min-w-0 flex-[2_1_220px]">
                <div className="flex items-baseline gap-2.5">
                    <Link
                        href={row.href}
                        aria-label={`Open ${row.name}`}
                        className="min-w-0 flex-1 rounded-[4px] text-[14px] font-semibold text-foreground transition-colors duration-fast hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-brand/80"
                    >
                        {row.name}
                    </Link>
                    <span className="font-display text-[15px] font-semibold tabular-nums">
                        {row.left}
                    </span>
                </div>
                <div
                    aria-hidden
                    className="mt-[7px] h-[5px] overflow-hidden rounded-full bg-muted"
                >
                    <div
                        className={cn("h-full rounded-full", BAR[row.bar])}
                        style={{ width: `${row.pct}%` }}
                    />
                </div>
                <div
                    className={cn(
                        "mt-1.5 text-[12.5px] font-semibold",
                        WHEN[row.whenTone],
                    )}
                >
                    {row.when}
                </div>
                {row.extNote ? (
                    <div className="mt-0.5 text-[12px] text-foreground/80">
                        {row.extNote}
                    </div>
                ) : null}
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {row.bought}
                </div>
            </div>
            <div className="flex max-w-[200px] flex-col items-end gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={why !== null}
                    aria-describedby={why ? whyId : undefined}
                    aria-label={`Extend ${row.name}'s pack`}
                    onClick={onExtend}
                >
                    Extend
                </Button>
                {why ? (
                    <span
                        id={whyId}
                        className="text-right text-[12px] text-muted-foreground"
                    >
                        {why}
                    </span>
                ) : null}
            </div>
        </li>
    );
}
