"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { Pill } from "@/components/subscriptions/pill";
import type { DetailHeader } from "@/lib/class-packs/pack-detail";

import { GUTTER } from "./detail-crumbs";

const BUTTON = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

export type Lens = "team" | "customer";

const LENSES: { key: Lens; label: string }[] = [
    { key: "team", label: "Team view" },
    { key: "customer", label: "Customer view" },
];

/**
 * Pack Detail's header (E16, after the design): the thumb, name and pills,
 * its terms, the Team/Customer lens, Sell at the desk and Edit pack; then,
 * for a pack not on sale, the band saying why — with Sell again on an
 * archived one.
 */
export function PackDetailHeader({
    name,
    head,
    lens,
    onLens,
    canSell,
    onSell,
    canWrite,
    busy,
    onRestore,
}: {
    name: string;
    head: DetailHeader;
    lens: Lens;
    onLens: (lens: Lens) => void;
    canSell: boolean;
    onSell: () => void;
    canWrite: boolean;
    busy: boolean;
    onRestore: () => void;
}) {
    return (
        <>
            <div
                className={cn(
                    "flex flex-wrap items-center gap-3.5 border-b border-border pb-4 pt-5",
                    GUTTER,
                )}
            >
                <div
                    aria-hidden
                    className="flex size-[52px] flex-none flex-col items-center justify-center rounded-[12px] bg-brand-subtle text-brand-subtle-foreground"
                >
                    <span className="font-display text-[20px] font-bold leading-none">
                        {head.thumbN}
                    </span>
                    <span className="mt-0.5 text-[11px] font-semibold">
                        {head.thumbUnit}
                    </span>
                </div>
                <div className="min-w-0 flex-[1_1_260px]">
                    <div className="flex flex-wrap items-center gap-[9px]">
                        <h1 className="m-0 font-display text-[24px] font-semibold tracking-[-0.025em]">
                            {name}
                        </h1>
                        <Pill tone={head.status.tone}>{head.status.label}</Pill>
                        <Pill tone="off">{head.kindLabel}</Pill>
                        {head.firstOnly ? (
                            <Pill tone="accent">First pack only</Pill>
                        ) : null}
                        {head.pending ? (
                            <Pill tone="accent">Changes not published</Pill>
                        ) : null}
                    </div>
                    <p className="m-0 mt-1 text-pretty text-[13px] text-muted-foreground">
                        {head.meta}
                    </p>
                </div>
                <div
                    role="group"
                    aria-label="View as"
                    className="flex rounded-[10px] bg-muted p-[3px]"
                >
                    {LENSES.map((l) => {
                        const on = lens === l.key;
                        return (
                            <button
                                key={l.key}
                                type="button"
                                aria-pressed={on}
                                onClick={() => onLens(l.key)}
                                className={cn(
                                    "cursor-pointer rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                    on
                                        ? "bg-card text-foreground shadow-xs"
                                        : "text-muted-foreground hover:text-foreground active:bg-accent-active",
                                )}
                            >
                                {l.label}
                            </button>
                        );
                    })}
                </div>
                {canSell ? (
                    <Button
                        variant="outline"
                        className={cn(BUTTON, "coarse:h-11")}
                        disabled={!head.onSale}
                        aria-describedby={
                            head.note ? "pack-detail-note" : undefined
                        }
                        onClick={onSell}
                    >
                        Sell at the desk
                    </Button>
                ) : null}
                {canWrite && head.editHref ? (
                    <Button asChild className={cn(BUTTON, "coarse:h-11")}>
                        <Link href={head.editHref}>
                            <svg
                                aria-hidden
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                className="size-3.5"
                            >
                                <path
                                    d="M4 20 H8 L19 9 L15 5 L4 16 Z M13 7 L17 11"
                                    stroke="currentColor"
                                    strokeWidth="1.9"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            Edit pack
                        </Link>
                    </Button>
                ) : null}
            </div>
            {head.note ? (
                <div
                    id="pack-detail-note"
                    role="note"
                    className={cn(
                        "flex flex-wrap items-center gap-2.5 border-b border-border bg-muted py-[11px]",
                        GUTTER,
                    )}
                >
                    <span className="flex-[1_1_280px] text-pretty text-[13px] leading-[1.5] text-foreground/80">
                        <strong className="text-foreground">
                            {head.note.head}
                        </strong>{" "}
                        {head.note.body}
                    </span>
                    {head.archived && canWrite ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={onRestore}
                        >
                            Sell again
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
