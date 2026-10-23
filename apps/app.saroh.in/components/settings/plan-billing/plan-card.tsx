import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { CalendarClock, Check } from "lucide-react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import type { PickerRow } from "@/lib/saroh-billing/plan-view";

import { card } from "./styles";

/** The seven cells on the grid's own rows, from the width `COLUMNS` goes side by side at. */
const SHARED_ROWS: Record<number, string> = {
    1: "",
    2: "[@container(min-width:500px)]:row-span-7 [@container(min-width:500px)]:grid-rows-subgrid",
    3: "[@container(min-width:750px)]:row-span-7 [@container(min-width:750px)]:grid-rows-subgrid",
    4: "[@container(min-width:1000px)]:row-span-7 [@container(min-width:1000px)]:grid-rows-subgrid",
};

/** The card's width, and a label longer than it wraps inside the button, never past it. */
const WIDE =
    "mt-4 h-auto min-h-[38px] w-full whitespace-normal py-1.5 coarse:h-auto coarse:min-h-11";

/**
 * One plan, as a card (owner, 13 Oct 2026). From the top: its name, and
 * "Current plan" on the one the business is on; the price, the largest
 * thing on it, with "a month + GST" small beside it; who it's for; the
 * first-month offer where this business would get it; then the button,
 * the card's full width, saying what it does ("Upgrade to Plan C", "Move
 * to Plan A from ‹date›"); what pressing it starts; and every line of the
 * plan.
 *
 * A move up is the filled button and anything else the quiet one. The plan
 * it's on has a button that is off and says so. A plan a change already
 * waits for says its date in the button's place, with no button to make
 * the change twice (DEC-159). Read without `billing:manage`, there is no
 * button at all.
 *
 * Seven cells, always, in this order: side by side the cards share their
 * rows (`grid-rows-subgrid`), so the prices, the buttons and the lists
 * line up whatever one card says that another doesn't.
 */
export function PlanCard({
    row,
    beside,
    canChange,
    onPick,
}: {
    row: PickerRow;
    /** How many plans are drawn: the cards share rows once they sit side by side. */
    beside: number;
    /** `billing:manage`: who may change the plan. */
    canChange: boolean;
    onPick: () => void;
}) {
    const cta = canChange ? row.cta : null;
    // The date has just been said, by the button or the state above.
    const dated = Boolean(row.scheduled ?? cta?.iso);
    return (
        <li
            data-plan={row.planId}
            aria-current={row.current ? "true" : undefined}
            className={cn(
                card,
                "grid content-start p-[18px]",
                SHARED_ROWS[beside] ?? SHARED_ROWS[3],
                // Ink, the selected look everywhere: an edge twice as
                // heavy, on a token that is defined for dark too.
                row.current && "border-foreground ring-1 ring-foreground",
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h3 className="font-display text-[16px] font-semibold">
                    {row.name}
                </h3>
                {row.current ? <Badge size="sm">Current plan</Badge> : null}
            </div>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="font-display text-[32px] font-semibold tabular-nums leading-none tracking-[-0.02em]">
                    {row.amount}
                </span>
                {row.per ? (
                    <span className="text-[13px] text-foreground/80">
                        {row.per}
                    </span>
                ) : null}
            </p>
            <div>
                {row.what ? (
                    <p className="mt-2.5 text-pretty text-[13.5px] text-foreground/80">
                        {row.what}
                    </p>
                ) : null}
            </div>
            <div>
                {row.offer ? (
                    <p className="mt-1.5 text-[13.5px] font-semibold">
                        {row.offer}
                    </p>
                ) : null}
            </div>
            <div>
                {row.scheduled ? (
                    <p className="mt-4 flex min-h-[38px] items-center justify-center gap-2 rounded-md bg-muted px-3 py-2 text-center text-sm font-semibold">
                        <CalendarClock
                            aria-hidden
                            className="size-4 shrink-0"
                        />
                        <span>
                            Your plan from <ViewerDate iso={row.scheduled} />
                        </span>
                    </p>
                ) : cta ? (
                    <Button
                        type="button"
                        variant={cta.primary ? "default" : "outline"}
                        className={WIDE}
                        // A plan's name is Saroh's own word, not a record's.
                        data-ph-unmask=""
                        onClick={onPick}
                    >
                        {/* One run of words: the button lays its
                            children out as a row, which drops the space
                            before the date. */}
                        <span>
                            {cta.label}
                            {cta.iso ? <ViewerDate iso={cta.iso} /> : null}
                            {cta.label.includes(row.name) ? null : (
                                <span className="sr-only">: {row.name}</span>
                            )}
                        </span>
                    </Button>
                ) : row.current && canChange ? (
                    <Button
                        type="button"
                        variant="outline"
                        className={WIDE}
                        data-ph-unmask=""
                        disabled
                    >
                        <span>
                            Current plan
                            <span className="sr-only">: {row.name}</span>
                        </span>
                    </Button>
                ) : null}
            </div>
            <div>
                {row.note ? (
                    <p className="mt-2 text-pretty text-[12.5px] text-foreground/80">
                        {dated && row.note.brief ? (
                            row.note.brief
                        ) : (
                            <>
                                {row.note.lead}
                                {row.note.iso ? (
                                    <ViewerDate iso={row.note.iso} />
                                ) : null}
                                {row.note.tail}
                            </>
                        )}
                    </p>
                ) : null}
            </div>
            <div>
                {row.lines.length > 0 ? (
                    <ul
                        aria-label={`What ${row.name} gives you`}
                        className="mt-4 grid gap-1.5 border-t border-border/70 pt-4 text-[13px] text-foreground/80"
                    >
                        {row.lead ? (
                            <li className="font-medium text-foreground">
                                {row.lead}
                            </li>
                        ) : null}
                        {row.lines.map((l) => (
                            <li key={l} className="flex items-start gap-2">
                                <Check
                                    aria-hidden
                                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                />
                                {l}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </li>
    );
}
