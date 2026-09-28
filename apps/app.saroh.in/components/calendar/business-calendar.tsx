"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Sheet, SheetContent, SheetTitle } from "@saroh/ui/sheet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";

import { CalendarNothing } from "@/components/calendar/calendar-nothing";
import { DayPanel } from "@/components/calendar/day-panel";
import { dayButton, MonthGrid } from "@/components/calendar/month-grid";
import { askedDay } from "@/lib/calendar/grid-keys";
import type { Off } from "@/lib/calendar/layers";
import {
    layersFor,
    mainCurrency,
    monthSummary,
    monthTitle,
    shiftMonth,
} from "@/lib/calendar/layers";
import { wholeMoney } from "@/lib/calendar/money";
import type { ProblemCan } from "@/lib/calendar/problems";
import type { Edge } from "@/lib/calendar/range";
import {
    calendarRange,
    dayShortcuts,
    monthEdges,
    openingDay,
} from "@/lib/calendar/range";
import type { CalendarMonth } from "@/lib/calendar/types";

import { TONE_BORDER, TONE_FILL } from "./tones";

/** Between the phone and the full rail the day opens as a sheet. */
const SHEET_WIDTHS = "(min-width: 760px) and (max-width: 1099px)";

function useDaySheet(): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const mq = window.matchMedia(SHEET_WIDTHS);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(SHEET_WIDTHS).matches,
        () => false,
    );
}

const listed = (labels: string[]) =>
    labels.length < 2
        ? (labels[0] ?? "")
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/**
 * Home › Calendar, after the "Saroh Business Calendar" design: the month, a
 * switch per layer with its count, the day's chips and takings, and the
 * picked day grouped by layer with a link to each record.
 */
export function BusinessCalendar({
    data,
    today,
    thisMonth,
    can,
    day: asked,
}: {
    data: CalendarMonth;
    /** "YYYY-MM-DD" and "YYYY-MM" now, in the business's zone. */
    today: string;
    thisMonth: string;
    /** May take an order, a booking, or send a reminder (E22): `*:write`. */
    can: { order: boolean; book: boolean } & ProblemCan;
    /** `?day=`: the day to open on, when a key crossed into this month. */
    day?: string;
}) {
    const router = useRouter();
    const layers = layersFor(data);
    const range = calendarRange(data.joinedAt, thisMonth);
    const [off, setOff] = useState<Off>({});
    const [selected, setSelected] = useState(() => {
        const dates = data.days.map((d) => d.date);
        return askedDay(asked, dates, range) ?? openingDay(dates, today, range);
    });
    const [sheetOpen, setSheetOpen] = useState(false);
    const sheetWidths = useDaySheet();

    if (layers.length === 0) return <CalendarNothing />;

    const currency = mainCurrency(data);
    const lead = layers[0];
    const day = data.days.find((d) => d.date === selected) ?? data.days.at(0);
    const failed = new Set(data.unavailable.map((u) => u.source));
    const missing = data.unavailable.map((u) => u.label);
    const money = data.takings !== undefined;
    const showTakings = money && data.takings?.total !== null && !off[lead.key];

    const pick = (date: string) => {
        setSelected(date);
        if (sheetWidths) setSheetOpen(true);
    };

    // A key moved the day: here, or — past this month's edge — in the month
    // before or after, which opens on that day (E28).
    const move = (date: string) => {
        const m = date.slice(0, 7);
        if (m === data.month) {
            setSelected(date);
            return;
        }
        const month = m === thisMonth ? "" : `month=${m}&`;
        router.push(`/calendar?${month}day=${date}`, { scroll: false });
    };

    const panel = (heading: (title: string) => React.ReactNode) =>
        day ? (
            <DayPanel
                day={day}
                layers={layers}
                off={off}
                today={today}
                timeZone={data.timezone}
                currency={currency}
                heading={heading}
                shortcuts={dayShortcuts(day.date, {
                    today,
                    range,
                    layers: data.layers,
                    can,
                })}
                can={can}
            />
        ) : null;

    const monthHref = (m: string) =>
        m === thisMonth ? "/calendar" : `/calendar?month=${m}`;
    const edges = monthEdges(data.month, range);
    const edgeNote = edges.before?.note ?? edges.after?.note;
    const isThisMonth = data.month === thisMonth;

    return (
        <>
            <PageHeader
                breadcrumb={["Home", "Calendar"]}
                title={monthTitle(data.month)}
                className="mb-0"
                actions={
                    <span className="w-full text-right text-[12.5px] text-muted-foreground sm:w-auto">
                        {monthSummary({
                            month: data,
                            layers,
                            off,
                            today,
                            money: wholeMoney,
                        })}
                    </span>
                }
            />

            <div className="!mt-0.5 flex flex-wrap items-center gap-1.5">
                <div className="flex gap-1">
                    <MonthStep
                        href={monthHref(shiftMonth(data.month, -1))}
                        label="Previous month"
                        edge={edges.before}
                    >
                        <ChevronLeft className="size-4" />
                    </MonthStep>
                    {isThisMonth ? (
                        // Already here: the design greys it and it does
                        // nothing, rather than reloading the same month.
                        <Button
                            variant="outline"
                            size="sm"
                            disabled
                            aria-current="date"
                            className="px-[11px] text-[12.5px] disabled:text-muted-foreground disabled:opacity-100"
                        >
                            This month
                        </Button>
                    ) : (
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="px-[11px] text-[12.5px]"
                        >
                            <Link href="/calendar">This month</Link>
                        </Button>
                    )}
                    <MonthStep
                        href={monthHref(shiftMonth(data.month, 1))}
                        label="Next month"
                        edge={edges.after}
                    >
                        <ChevronRight className="size-4" />
                    </MonthStep>
                </div>
                {edgeNote ? (
                    // Said on the page as well as on the button: a reason
                    // only on hover is one a phone never shows.
                    <span
                        id="calendar-edge"
                        className="text-[12px] text-muted-foreground"
                    >
                        {edgeNote}
                    </span>
                ) : null}
                <span className="flex-1" />
                <div
                    role="group"
                    aria-label="Show on the calendar"
                    className="flex flex-wrap gap-1.5"
                >
                    {layers.map((layer) => {
                        const on = !off[layer.key];
                        const broken = failed.has(layer.key);
                        return (
                            <button
                                key={layer.key}
                                type="button"
                                aria-pressed={on}
                                disabled={broken}
                                onClick={() =>
                                    setOff((o) => ({
                                        ...o,
                                        [layer.key]: !o[layer.key],
                                    }))
                                }
                                className={cn(
                                    "inline-flex h-8 items-center gap-[5px] rounded-full border px-[11px] text-[12.5px] font-semibold transition-colors duration-fast coarse:h-11",
                                    broken
                                        ? "cursor-not-allowed border-dashed border-border text-muted-foreground"
                                        : on
                                          ? "border-foreground bg-card text-foreground"
                                          : "border-border bg-transparent text-muted-foreground hover:border-border-strong",
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mr-1.5 inline-block size-[9px] rounded-[3px] border-[1.5px]",
                                        TONE_BORDER[layer.tone],
                                        on && !broken
                                            ? TONE_FILL[layer.tone]
                                            : "bg-transparent",
                                    )}
                                />
                                {layer.label}
                                <span className="font-medium text-muted-foreground">
                                    {broken
                                        ? "couldn't load"
                                        : (data.totals[layer.key] ?? 0)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {missing.length > 0 ? (
                <PartialNotice
                    action={
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.refresh()}
                        >
                            Try again
                        </Button>
                    }
                >
                    {listed(missing)} couldn&apos;t be loaded, so{" "}
                    {missing.length === 1 ? "it is" : "they are"} missing from
                    this month — everything else is here.
                    {money && data.takings?.total === null
                        ? " Takings are left out while part of them is missing."
                        : ""}
                </PartialNotice>
            ) : null}

            <div className="!mt-3.5 flex flex-wrap items-start gap-4">
                <MonthGrid
                    month={data.month}
                    days={data.days}
                    range={range}
                    layers={layers}
                    off={off}
                    today={today}
                    selected={day?.date ?? ""}
                    currency={currency}
                    showTakings={showTakings}
                    onPick={pick}
                    onMove={move}
                />
                {/* Beside the month on the desk, under it on a phone; a
                    sheet in between (below). */}
                <div
                    id="calendar-day"
                    role="region"
                    aria-labelledby="calendar-day-title"
                    className="min-w-0 flex-[2_1_280px] rounded-xl border border-border bg-card px-4 py-3.5 max-[1099px]:min-[760px]:hidden min-[1100px]:sticky min-[1100px]:top-3"
                >
                    {panel((title) => (
                        <h2
                            id="calendar-day-title"
                            className="font-display text-[16px] font-semibold tracking-[-0.02em]"
                        >
                            {title}
                        </h2>
                    ))}
                </div>
            </div>

            <p className="!mt-3 text-[11.5px] text-muted-foreground">
                Everything here is read from orders, subscriptions, invoices and
                bookings — nothing is entered on the calendar itself.{" "}
                <span className="min-[760px]:hidden">
                    Each dot is a layer with something that day; red means
                    something that needs you. Tap a day to see it.
                </span>
                {showTakings ? (
                    <span className="max-[759px]:hidden">
                        The bar in each day is what was taken that day, scaled
                        to the busiest day.
                    </span>
                ) : null}
            </p>

            <Sheet open={sheetOpen && sheetWidths} onOpenChange={setSheetOpen}>
                {/* A dialog: Tab stays inside, Esc closes it. It opens on
                    the day's title, and closing it puts focus back on the day
                    in the grid rather than at the top of the page (E28). */}
                <SheetContent
                    side="right"
                    className="w-[380px] max-w-full overflow-y-auto px-[18px] py-4 sm:max-w-[380px]"
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        document
                            .getElementById("calendar-sheet-title")
                            ?.focus();
                    }}
                    onCloseAutoFocus={(e) => {
                        e.preventDefault();
                        if (day) dayButton(day.date)?.focus();
                    }}
                >
                    {panel((title) => (
                        <SheetTitle
                            id="calendar-sheet-title"
                            tabIndex={-1}
                            className="pr-10 font-display text-[16px] font-semibold tracking-[-0.02em] outline-none"
                        >
                            {title}
                        </SheetTitle>
                    ))}
                </SheetContent>
            </Sheet>
        </>
    );
}

/**
 * ‹ or ›: a link to the next month, or — at the edge of what the calendar
 * reaches — a greyed button that stays focusable and says why.
 */
function MonthStep({
    href,
    label,
    edge,
    children,
}: {
    href: string;
    label: string;
    edge: Edge | null;
    children: React.ReactNode;
}) {
    if (edge) {
        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                aria-disabled
                aria-label={label}
                aria-describedby="calendar-edge"
                title={edge.title}
                className="w-8 cursor-default px-0 text-muted-foreground hover:bg-card hover:text-muted-foreground"
            >
                {children}
            </Button>
        );
    }
    return (
        <Button asChild variant="outline" size="sm" className="w-8 px-0">
            <Link href={href} aria-label={label}>
                {children}
            </Link>
        </Button>
    );
}
