"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { MonthStep } from "@/components/calendar/month-step";
import type { CalendarView } from "@/components/calendar/view-switch";
import { ViewSwitch } from "@/components/calendar/view-switch";
import type { Edge } from "@/lib/calendar/range";

interface Step {
    href: string;
    label: string;
    /** At the edge of what the calendar reaches: greyed, and why. */
    edge: Edge | null;
}

/** On a phone a step is a bare 44px arrow beside the title (the board). */
const PHONE_STEP =
    "max-[759px]:size-11 max-[759px]:border-0 max-[759px]:bg-transparent max-[759px]:shadow-none";

/**
 * The Calendar month's top (bookings U13): the month as the page's title
 * between ‹ and ›, This month, Month | Week (E25) and the one filter
 * button, What to show. The desk reads "‹ › October 2026 · This month ·
 * Month | Week ······ What to show" on one row (BKDCalMonth); a phone puts
 * "‹ October 2026 › Month | Week" over the filter and This month
 * (BKMOverviewMonth). One set of controls, ordered per width, so nothing
 * is drawn twice. Where ‹ or › stops, why is said on the page as well as on
 * the button: a reason only on hover is one a phone never shows.
 */
export function MonthToolbar({
    title,
    prev,
    next,
    current,
    view,
    filter,
}: {
    /** "October 2026". */
    title: string;
    prev: Step;
    next: Step;
    /** "This month", and whether it is the one shown. */
    current: { label: string; href: string; here: boolean };
    view: { value: CalendarView; hrefs: Record<CalendarView, string> };
    /** What to show: the one filter button. */
    filter: React.ReactNode;
}) {
    const edgeNote = prev.edge?.note ?? next.edge?.note;
    return (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 max-[759px]:gap-x-0.5">
            <MonthStep
                href={prev.href}
                label={prev.label}
                edge={prev.edge}
                className={cn("order-1", PHONE_STEP, "max-[759px]:-ml-2.5")}
            >
                <ChevronLeft className="size-4 max-[759px]:size-[18px]" />
            </MonthStep>
            <MonthStep
                href={next.href}
                label={next.label}
                edge={next.edge}
                className={cn("order-2 max-[759px]:order-4", PHONE_STEP)}
            >
                <ChevronRight className="size-4 max-[759px]:size-[18px]" />
            </MonthStep>
            {/* The month is the page's title; the steps either side of it
                move it (the board), so it is drawn here, not by PageHeader. */}
            <h1 className="order-3 mx-1 min-w-0 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] max-[759px]:mx-0 max-[759px]:flex-1 max-[759px]:text-[21px] max-[759px]:tracking-[-0.02em]">
                {title}
            </h1>
            <div className="order-4 max-[759px]:order-8">
                {current.here ? (
                    // Already here: the design greys it and it does
                    // nothing, rather than reloading the same page.
                    <Button
                        variant="outline"
                        size="sm"
                        disabled
                        aria-current="date"
                        className="max-[759px]:h-11 max-[759px]:rounded-[10px] max-[759px]:px-3.5"
                    >
                        {current.label}
                    </Button>
                ) : (
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="max-[759px]:h-11 max-[759px]:rounded-[10px] max-[759px]:px-3.5"
                    >
                        <Link href={current.href}>{current.label}</Link>
                    </Button>
                )}
            </div>
            <div className="order-5 max-[759px]:ml-1.5 max-[759px]:w-[150px] [&>*]:ml-0 max-[759px]:[&>*]:w-full">
                <ViewSwitch view={view.value} hrefs={view.hrefs} />
            </div>
            {edgeNote ? (
                <span
                    id="calendar-edge"
                    className="order-6 text-[12px] text-muted-foreground max-[759px]:order-10 max-[759px]:basis-full"
                >
                    {edgeNote}
                </span>
            ) : null}
            <span
                aria-hidden
                className="order-6 flex-1 max-[759px]:order-5 max-[759px]:flex-none max-[759px]:basis-full"
            />
            <div className="order-7 flex min-w-0 max-[759px]:order-6 max-[759px]:mr-1.5 max-[759px]:flex-1">
                {filter}
            </div>
        </div>
    );
}
