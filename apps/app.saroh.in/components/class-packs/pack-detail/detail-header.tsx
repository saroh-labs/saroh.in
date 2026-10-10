"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { packCrumbs } from "../pack-editor/pack-crumbs";

import type { DetailHeader } from "@/lib/class-packs/pack-detail";

import { StatusBadge } from "@/components/shared/status-badge";
import { Notice } from "@saroh/ui/notice";
/** The page's gutter: the page container's own, 26px and 16px on a phone. */
export const GUTTER = "px-4 sm:px-[26px]";

export type Lens = "team" | "customer";

const LENSES: { key: Lens; label: string }[] = [
    { key: "team", label: "Team view" },
    { key: "customer", label: "Customer view" },
];

/**
 * Pack Detail's header (E16): the page header every screen draws, with
 * where the pack sits, its thumb, name and pills, its terms, whether the
 * booking page shows it, the Team/Customer lens, Sell at the desk and Edit
 * pack; then,
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
            <div className={cn("border-b border-border pb-4 pt-5", GUTTER)}>
                <PageHeader
                    className="mb-0"
                    breadcrumb={packCrumbs(name)}
                    lead={
                        <div
                            aria-hidden
                            className="flex size-[52px] flex-col items-center justify-center rounded-[12px] bg-muted text-foreground"
                        >
                            <span className="font-display text-[20px] font-bold leading-none">
                                {head.thumbN}
                            </span>
                            <span className="mt-0.5 text-[11px] font-semibold">
                                {head.thumbUnit}
                            </span>
                        </div>
                    }
                    title={name}
                    badge={
                        <>
                            <StatusBadge tone={head.status.tone}>
                                {head.status.label}
                            </StatusBadge>
                            <StatusBadge tone="off">
                                {head.kindLabel}
                            </StatusBadge>
                            {head.firstOnly ? (
                                <StatusBadge tone="accent">
                                    First pack only
                                </StatusBadge>
                            ) : null}
                            {head.pending ? (
                                <StatusBadge tone="accent">
                                    Changes not published
                                </StatusBadge>
                            ) : null}
                        </>
                    }
                    description={head.meta}
                    meta={
                        <>
                            {head.bookingPage ? (
                                <span className="text-[12.5px] font-medium">
                                    {head.bookingPage}
                                </span>
                            ) : null}
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
                        </>
                    }
                    actions={
                        canSell || (canWrite && head.editHref) ? (
                            <>
                                {canSell ? (
                                    <Button
                                        variant="outline"
                                        disabled={!head.onSale}
                                        aria-describedby={
                                            head.note
                                                ? "pack-detail-note"
                                                : undefined
                                        }
                                        onClick={onSell}
                                    >
                                        Sell at the desk
                                    </Button>
                                ) : null}
                                {canWrite && head.editHref ? (
                                    <Button asChild>
                                        <Link href={head.editHref}>
                                            Edit pack
                                        </Link>
                                    </Button>
                                ) : null}
                            </>
                        ) : undefined
                    }
                />
            </div>
            {head.note ? (
                <Notice
                    id="pack-detail-note"
                    layout="banner"
                    icon={false}
                    className={GUTTER}
                >
                    <div className="flex flex-wrap items-center gap-2.5">
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
                </Notice>
            ) : null}
        </>
    );
}
