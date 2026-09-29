"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId } from "react";

import { Pill } from "@/components/subscriptions/pill";
import type { PackCardView } from "@/lib/class-packs/pack-cards";

const BUTTON = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";
const EYEBROW =
    "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

/**
 * One pack on the Packs list (round-2 E15, after "Saroh Packs"): its
 * badges, price and terms, what it has sold and what is still to use, and
 * Open (its Pack Detail, E16), Sell at the desk, Edit and Archive. A draft
 * has no Open or Sell and opens the editor; an archived pack keeps Sell,
 * off, with why beside it.
 */
export function PackCard({
    card,
    canWrite,
    canSell,
    busy,
    onSell,
    onArchive,
}: {
    card: PackCardView;
    canWrite: boolean;
    canSell: boolean;
    busy: boolean;
    onSell: () => void;
    onArchive: () => void;
}) {
    const whyId = useId();
    return (
        <article
            aria-label={card.name}
            className={cn(
                "h-full rounded-[12px] border border-border bg-card px-4 py-3.5",
                card.archived && "opacity-70",
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                {card.href ? (
                    <Link
                        href={card.href}
                        className="min-w-0 flex-1 rounded-sm text-[15px] font-semibold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-brand"
                    >
                        {card.name}
                    </Link>
                ) : (
                    <span className="min-w-0 flex-1 text-[15px] font-semibold">
                        {card.name}
                    </span>
                )}
                {card.badges.map((b) => (
                    <Pill key={b.label} tone={b.tone}>
                        {b.label}
                    </Pill>
                ))}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[24px] font-semibold tabular-nums tracking-[-0.02em]">
                    {card.price}
                </span>
                {card.each ? (
                    <span className="text-[12.5px] text-muted-foreground">
                        {card.each}
                    </span>
                ) : null}
            </div>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-foreground/80">
                {card.terms}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-border pt-3">
                <div className="min-w-0">
                    <div className={EYEBROW}>Sold</div>
                    <div className="mt-0.5 text-[17px] font-semibold tabular-nums">
                        {card.sold}
                    </div>
                    {card.takings ? (
                        <div className="text-[12px] text-muted-foreground">
                            {card.takings}
                        </div>
                    ) : null}
                </div>
                <div className="min-w-0">
                    <div className={EYEBROW}>Still to use</div>
                    <div className="mt-0.5 text-[17px] font-semibold tabular-nums">
                        {card.stillToUse}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                        {card.stillToUseNote}
                    </div>
                </div>
            </div>
            {card.why ? (
                <p
                    id={whyId}
                    className="mt-2 text-[12px] text-muted-foreground"
                >
                    {card.why}
                </p>
            ) : null}
            {card.openHref || canSell || canWrite ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {card.openHref ? (
                        <Button
                            asChild
                            variant="outline"
                            className={cn(BUTTON, "coarse:h-11")}
                        >
                            <Link
                                href={card.openHref}
                                aria-label={`Open ${card.name}`}
                            >
                                Open
                            </Link>
                        </Button>
                    ) : null}
                    {canSell && card.showSell ? (
                        <Button
                            variant="outline"
                            className={cn(BUTTON, "coarse:h-11")}
                            disabled={card.sellDisabled}
                            aria-describedby={
                                card.sellDisabled && card.why
                                    ? whyId
                                    : undefined
                            }
                            onClick={onSell}
                        >
                            Sell at the desk
                        </Button>
                    ) : null}
                    {canWrite ? (
                        <Button
                            asChild
                            variant="outline"
                            className={cn(BUTTON, "coarse:h-11")}
                        >
                            <Link
                                href={card.editHref}
                                aria-label={`Edit ${card.name}`}
                            >
                                Edit
                            </Link>
                        </Button>
                    ) : null}
                    {canWrite && card.canArchive ? (
                        <Button
                            variant="outline"
                            className={cn(BUTTON, "coarse:h-11")}
                            disabled={busy}
                            onClick={onArchive}
                        >
                            {card.archived ? "Sell again" : "Archive"}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}
