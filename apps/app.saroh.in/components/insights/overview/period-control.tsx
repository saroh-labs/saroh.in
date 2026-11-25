"use client";

import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { useRef, useState } from "react";

import type { InsightsPeriod } from "@/lib/insights/period";
import { PERIOD_LABEL } from "@/lib/insights/period";

/**
 * Insights' one period for the whole page (DEC-171, plan U10, #1089):
 * the last 7 days, the last 4 weeks or the last 3 months, each an address
 * (`?period=`), so Back, a refresh and a shared link keep it, and the tab
 * and the website chosen go with it.
 *
 * - On the desk (`IBOverviewD`, `IBPeriodD`): the three side by side, in
 *   the header's actions.
 * - On a phone (`IBOverviewP`, `IBPeriodP`): one button beside the title
 *   with the period's name, opening a sheet that names each period's days
 *   and what they are set against. Choosing one goes there and closes it.
 *
 * The sheet is the shared one from the foot, as Home's New is: it traps
 * focus, Escape and the scrim close it, and focus returns to the button;
 * focus goes to Close on opening. Each choice is 48px or more, past a thumb's 44.
 */

export interface PeriodChoice {
    period: InsightsPeriod;
    /** Where choosing it goes: this tab, for that period. */
    href: string;
    /** "13 to 19 Oct, against 6 to 12 Oct". */
    line: string;
}

/** The desk's three, side by side. */
export function PeriodSegments({
    value,
    choices,
    className,
}: {
    value: InsightsPeriod;
    choices: readonly PeriodChoice[];
    className?: string;
}) {
    return (
        <Segmented
            label="Show figures for"
            size="md"
            value={value}
            className={className}
            options={choices.map((c) => ({
                value: c.period,
                label: PERIOD_LABEL[c.period],
                href: c.href,
            }))}
        />
    );
}

/** The phone's button and its sheet. */
export function PeriodSheet({
    value,
    choices,
    className,
}: {
    value: InsightsPeriod;
    choices: readonly PeriodChoice[];
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <button
                    type="button"
                    aria-label={`Show figures for: ${PERIOD_LABEL[value]}`}
                    className={cn(
                        // The board's period button: 40px, white, a 10px
                        // corner; 44px under a thumb.
                        "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border bg-card px-3 text-[13.5px] font-semibold text-foreground transition-colors duration-fast hover:border-border-strong active:bg-accent-active coarse:h-11",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        className,
                    )}
                >
                    <CalendarDays aria-hidden className="size-4" />
                    {PERIOD_LABEL[value]}
                    <ChevronDown aria-hidden className="size-3.5" />
                </button>
            </SheetTrigger>
            <SheetContent
                side="bottom"
                // Close is in the sheet's own header row (the board's).
                closeButton={false}
                data-ph-unmask=""
                aria-describedby="insights-period-note"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    closeRef.current?.focus();
                }}
                // The board's sheet on the shared one: 76% tall at most, no
                // edge, its own padding and shadow.
                className="flex max-h-[76%] flex-col gap-0 overflow-hidden rounded-t-[18px] border-t-0 p-0 px-4 pt-2 shadow-[0_-10px_32px_hsl(var(--shadow-color)/0.2)] outline-none"
            >
                <span
                    aria-hidden
                    className="mb-2 h-1 w-10 shrink-0 self-center rounded-sm bg-border"
                />
                <div className="flex items-center justify-between pb-2">
                    <SheetTitle className="font-display text-[19px] font-semibold leading-tight tracking-[-0.02em]">
                        Show figures for
                    </SheetTitle>
                    <SheetClose
                        ref={closeRef}
                        aria-label="Close"
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-foreground/80 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:bg-accent-active coarse:size-11"
                    >
                        <X aria-hidden className="size-[18px]" />
                    </SheetClose>
                </div>
                <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto overscroll-contain pb-[calc(12px+env(safe-area-inset-bottom))]">
                    <ul className="grid gap-2">
                        {choices.map((c) => {
                            const on = c.period === value;
                            return (
                                <li key={c.period}>
                                    <IntentLink
                                        href={c.href}
                                        scroll={false}
                                        aria-current={on ? "true" : undefined}
                                        onClick={() => setOpen(false)}
                                        className={cn(
                                            "flex min-h-12 w-full items-center gap-3 rounded-[10px] border bg-card px-3 py-1.5 text-left text-foreground transition-colors duration-fast hover:bg-muted active:bg-accent-active",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                                            on
                                                ? "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                                                : "border-border",
                                        )}
                                    >
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "size-[18px] shrink-0 rounded-full",
                                                on
                                                    ? "border-[5.5px] border-foreground"
                                                    : "border-[1.5px] border-border-strong",
                                            )}
                                        />
                                        <span className="grid min-w-0 flex-1 gap-0.5 text-[13.5px]">
                                            <b className="font-semibold">
                                                {PERIOD_LABEL[c.period]}
                                            </b>
                                            <small className="text-xs text-muted-foreground">
                                                {c.line}
                                            </small>
                                        </span>
                                    </IntentLink>
                                </li>
                            );
                        })}
                    </ul>
                    <p
                        id="insights-period-note"
                        className="text-xs text-muted-foreground"
                    >
                        Every figure on Insights follows this choice.
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
