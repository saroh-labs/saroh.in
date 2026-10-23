"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { FailedRead } from "@/components/shared/states/failed-read";
import { count } from "@/lib/format/plural";
import type { PriceHistoryPage } from "@/lib/price-history/words";
import {
    PRICE_HISTORY_SHORT,
    priceHistoryRows,
} from "@/lib/price-history/words";

/**
 * Price history (owner, 12 Oct 2026): what an item has cost, each change
 * with who made it and when, newest first. Read-only rows after Plan
 * Detail's History: the day, what changed, who.
 *
 * Shared by the product page, the Service Editor's side column and the
 * course page, each of which gives it its own heading. An item with no
 * history yet draws nothing at all, heading included, so each asks
 * `priceHistoryShown` (`lib/price-history/words.ts`) before it draws its
 * section.
 */

export function PriceHistoryList({
    history,
    layout = "wide",
    framed = false,
}: {
    /** Null when the read failed. */
    history: PriceHistoryPage | null;
    /**
     * `wide`: one row across (day, what, who), as Plan Detail's History.
     * `narrow`: a side column, what changed over the day and who.
     */
    layout?: "wide" | "narrow";
    /** Draw the list's own border, where it isn't already inside a card. */
    framed?: boolean;
}) {
    const zone = useBusinessZone();
    const listId = useId();
    const [all, setAll] = useState(false);
    if (history === null) {
        return <FailedRead things="the price history" />;
    }
    const rows = priceHistoryRows(history.entries, zone);
    if (rows.length === 0) return null;
    const long = rows.length > PRICE_HISTORY_SHORT;
    const shown = all || !long ? rows : rows.slice(0, PRICE_HISTORY_SHORT);

    return (
        <>
            <ol
                id={listId}
                data-ph-mask=""
                className={cn(
                    framed &&
                        "overflow-hidden rounded-[12px] border border-border",
                )}
            >
                {shown.map((row, i) => (
                    <li
                        key={row.id}
                        className={cn(
                            "text-[13px]",
                            layout === "wide"
                                ? "flex flex-wrap gap-x-3.5 gap-y-1 py-[11px]"
                                : "py-[9px]",
                            framed && "px-4",
                            (i > 0 || !framed) && "border-t border-border/70",
                        )}
                    >
                        {layout === "wide" ? (
                            <span className="flex-[0_0_80px] tabular-nums text-muted-foreground">
                                {row.date}
                            </span>
                        ) : null}
                        <span
                            className={cn(
                                "flex min-w-0 flex-col gap-0.5 tabular-nums",
                                layout === "wide" && "flex-[1_1_240px]",
                            )}
                        >
                            {row.lines.map((line) => (
                                <span key={line} className="text-pretty">
                                    {line}
                                </span>
                            ))}
                        </span>
                        {layout === "wide" ? (
                            <span className="text-muted-foreground">
                                {row.who}
                            </span>
                        ) : (
                            <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                {row.date} · {row.who}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
            {long ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={all}
                        aria-controls={listId}
                        onClick={() => setAll((open) => !open)}
                    >
                        {all ? "Show fewer" : "Show all"}
                    </Button>
                    {all && history.nextCursor ? (
                        <p className="text-[12px] text-muted-foreground">
                            Showing the latest {count(rows.length, "change")}.
                        </p>
                    ) : null}
                </div>
            ) : history.nextCursor ? (
                <p className="mt-3 text-[12px] text-muted-foreground">
                    Showing the latest {count(rows.length, "change")}.
                </p>
            ) : null}
        </>
    );
}
