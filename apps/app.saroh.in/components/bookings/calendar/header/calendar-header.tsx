"use client";

import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import {
    CalendarDays,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Globe,
    MoreHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
    BookingsModeSwitch,
    BookingsPhoneBar,
} from "@/components/bookings/all-bookings/bookings-view-switch";
import { formatDay } from "@/lib/format/datetime";
import type { BookingsOpens, ShowFor } from "@/lib/services/bookings-opens";
import { EVERYONE } from "@/lib/services/bookings-opens";
import type { DayFacts } from "@/lib/services/calendar-header";
import {
    cancelledLine,
    dayRange,
    headerTitle,
    periodWord as periodWordOf,
    phoneTitle,
} from "@/lib/services/calendar-header";
import type { CalendarLayout, GoogleShow } from "@/lib/services/calendar-href";
import { callName } from "@/lib/services/call-name";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, weekStartOf } from "@/lib/services/diary";

import {
    useScreenGo,
    useScreenLink,
} from "@/components/shared/page/screen-pending";

import { DateSheet } from "./date-sheet";
import { OptionsSheet } from "./options-sheet";
import type { PersonChoice } from "./people-sheet";
import { PeopleSheet, PersonFace } from "./people-sheet";
import { useBookingsOpens } from "./use-bookings-opens";
import { usePhoneOrUnknown } from "./use-phone";
import { WeekStrip } from "./week-strip";

type Open = "date" | "people" | "opts" | null;

/** The layout's own name, said beside the date: List is the register now. */
const VIEW_NAME: Record<CalendarLayout, string> = {
    day: "Day",
    week: "Week",
    agenda: "Agenda",
};

const STEP =
    "flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11";
/** On a phone the arrows are for a keyboard and a screen reader: swipe is the touch. */
const PHONE_STEP =
    "max-[759px]:sr-only max-[759px]:focus:not-sr-only max-[759px]:focus:absolute max-[759px]:focus:z-10 max-[759px]:focus:bg-card";

/**
 * Header C (U2, #1018; BKMBookingsDay on a phone, BKDCalendarDay on the
 * desk) as BKVCalendarB drew it: one header for Day, Week and Agenda. A
 * Today button, a date title that names the view and opens Go to a day (the
 * week, the month, Show as, Go to today); a person chip that opens Whose
 * bookings; the Calendar | List switch (List is the register of every
 * booking); "…" with the view's options; one summary line. On the
 * desk the arrows beside the date go a day (or week) back or on and the
 * line ends "Times in IST"; on a phone the arrows are for a keyboard and a
 * screen reader, and the calendar is swiped.
 *
 * Everything the old toolbar row held has a place: back and forward, Today
 * (Go to today), the view switch (Show as), the person switch (the chip),
 * the cancelled toggle, the colour key, All bookings and Hours (the "…"
 * sheet), and New booking (beside "…", a floating button on a phone).
 */
export function CalendarHeader({
    layout,
    date,
    today,
    summary,
    zone,
    choices,
    picked,
    facts,
    cancelled,
    opens: kept,
    me,
    hrefFor,
    newBooking,
    calOnly,
    onAddPerson,
    google,
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    /**
     * The one line: "5 booked · 3 free times · ₹2,400 booked"; a bar while
     * the diary is on its way.
     */
    summary: ReactNode;
    /** The business's zone, short: "IST". */
    zone: string;
    /**
     * Everyone, then each person on the diary; empty with nobody to pick;
     * null while the diary is on its way (a placeholder chip).
     */
    choices: readonly PersonChoice[] | null;
    /** Whose bookings are shown: a staff id or `EVERYONE`. */
    picked: string;
    facts: (d: LocalDate) => DayFacts;
    cancelled: {
        /** Null while the diary is on its way: not said, never "None". */
        count: number | null;
        shown: boolean;
        onChange: (on: boolean) => void;
    };
    /** Where Bookings opens for this person, as kept. */
    opens: BookingsOpens;
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me: { id: string; name: string } | null;
    /** The calendar's address for a layout, a day and a person. */
    hrefFor: (
        layout: CalendarLayout,
        date: LocalDate,
        person?: string,
    ) => string;
    newBooking: ReactNode;
    /** They see the calendar but can't book or change bookings. */
    calOnly: boolean;
    /** Add someone who takes bookings, for someone who may. */
    onAddPerson?: () => void;
    /**
     * The Google layer and who is connected (BKVGoogle), while Google
     * Calendar is on for the business; null leaves both out of "…".
     */
    google?: {
        show: GoogleShow;
        onChange: (show: GoogleShow) => void;
        people: readonly {
            staffId: string;
            state: "CONNECTED" | "LAPSED" | "PAUSED";
        }[];
    } | null;
}) {
    // The screen's transition: the diary greys while the header stays.
    const screenGo = useScreenGo();
    const screenLink = useScreenLink();
    // Null on the server and while hydrating: both frames are drawn, CSS
    // shows the right one, so the first paint never jumps.
    const known = usePhoneOrUnknown();
    const [open, setOpen] = useState<Open>(null);
    const { opens, change } = useBookingsOpens(kept);
    const toggle = (which: Exclude<Open, null>) => (o: boolean) =>
        setOpen(o ? which : null);
    const go = (href: string) => {
        setOpen(null);
        screenGo(href);
    };

    const title = headerTitle(layout, date, today);
    const short = phoneTitle(layout, date, today);
    const step = layout === "week" ? 7 : 1;
    const unit = layout === "week" ? "week" : "day";
    const inWeek = layout === "week";
    const weekStart = weekStartOf(date);
    // "today" only on today: another day is named ("on Tue 20 Oct").
    const periodWord = periodWordOf(layout, date, today);
    const period = inWeek
        ? `${dayRange(weekStart, addDays(weekStart, 6), " to ")}${weekStart === weekStartOf(today) ? " · this week" : ""}`
        : `${formatDay(date, { weekday: "short", today })}${date === today ? " · today" : ""}`;
    const optsTitle =
        layout === "week"
            ? "This week"
            : layout === "agenda"
              ? "This agenda"
              : "This day";

    const loadingPeople = choices === null;
    const person = choices?.find((c) => c.key === picked) ?? choices?.at(0);
    const others = (choices ?? []).filter((c) => c.key !== EVERYONE);
    // One person in the business: no chip, the title alone (U2).
    const showChip = others.length > 1;
    const everyone = picked === EVERYONE || person === undefined;
    const whoName = everyone ? "Everyone" : person.name;
    // Only when the person shown is the one kept: a link (Hours ›
    // Bookings, an alert) may show someone else.
    const remembered =
        !everyone && opens.showFor === "last" && picked === opens.lastPerson
            ? `Showing ${callName(whoName)}, your last pick`
            : null;
    const hoursLabel = everyone
        ? "Hours and time off"
        : `${callName(whoName)}’s hours and time off`;
    const hoursHref = everyone
        ? "/bookings/availability"
        : `/bookings/availability?person=${encodeURIComponent(picked)}`;

    const pickPerson = (key: string) => {
        go(hrefFor(layout, date, key));
        void change({ lastPerson: key === EVERYONE ? null : key });
    };
    const pickShowFor = (showFor: ShowFor) => {
        void change({ showFor });
        if (showFor === "all") go(hrefFor(layout, date, EVERYONE));
        else if (showFor === "me" && me) go(hrefFor(layout, date, me.id));
    };

    const titleButton = (phone: boolean) => (
        <button
            type="button"
            aria-label={`${title}. Change the day or the view`}
            data-calendar-title=""
            className={cn(
                "inline-flex h-11 min-w-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] pl-1.5 pr-2 font-display text-[28px] font-semibold tracking-[-0.03em] text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted",
                "max-[759px]:h-12 max-[759px]:flex-1 max-[759px]:gap-1 max-[759px]:rounded-none max-[759px]:px-0 max-[759px]:text-left max-[759px]:text-[19px] max-[759px]:tracking-[-0.02em] max-[759px]:hover:bg-transparent max-[759px]:data-[state=open]:bg-transparent",
            )}
        >
            {phone ? (
                <>
                    <span className="min-w-0 whitespace-nowrap">
                        {short.lead ? (
                            <span className="max-[359px]:hidden">
                                {short.lead}{" "}
                            </span>
                        ) : null}
                        {short.main}
                    </span>
                    <span
                        data-view-name=""
                        className="ml-1 shrink-0 rounded-full border border-border px-2 py-0.5 font-sans text-[12.5px] font-medium tracking-normal text-muted-foreground"
                    >
                        {VIEW_NAME[layout]}
                    </span>
                </>
            ) : (
                <span className="min-w-0 truncate">{title}</span>
            )}
            <ChevronDown
                aria-hidden
                className="size-5 shrink-0 max-[759px]:size-[18px]"
            />
        </button>
    );

    const chip = person ? (
        <button
            type="button"
            aria-label={`Whose bookings: ${whoName}. Change`}
            className="inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2.5 text-[13.5px] font-semibold text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground max-[759px]:h-11 max-[759px]:text-[14px]"
        >
            {/* Faces: on the desk a stack of everyone's, on a phone one. */}
            <span aria-hidden className="flex max-[759px]:hidden">
                {(everyone ? others.slice(0, 3) : [person]).map((c, i) => (
                    <PersonFace
                        key={c.key}
                        choice={c}
                        className={cn(
                            "size-7 border-2 border-card text-[10.5px]",
                            i > 0 && "-ml-2",
                        )}
                    />
                ))}
            </span>
            <PersonFace
                choice={everyone ? { key: EVERYONE, initials: "All" } : person}
                className="size-[34px] text-[11.5px] min-[760px]:hidden"
            />
            <span className="max-[759px]:hidden">{whoName}</span>
            <span className="min-[760px]:hidden">
                {everyone ? "Everyone" : callName(whoName)}
            </span>
            <ChevronDown aria-hidden className="size-4" />
        </button>
    ) : null;

    const optsButton = (
        <button
            type="button"
            aria-label={`${optsTitle}: show cancelled, all bookings, hours, start on, colours`}
            className="grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-[9px] border border-border bg-card text-foreground/80 transition-colors duration-fast hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground max-[759px]:size-11 max-[759px]:rounded-full"
        >
            <MoreHorizontal aria-hidden className="size-[18px]" />
        </button>
    );

    const options = (
        <OptionsSheet
            open={open === "opts"}
            onOpenChange={toggle("opts")}
            trigger={optsButton}
            title={optsTitle}
            summary={summary}
            cancelled={{
                shown: cancelled.shown,
                onChange: cancelled.onChange,
                line:
                    cancelled.count === null
                        ? `Cancelled ${periodWord}`
                        : cancelledLine(cancelled.count, periodWord),
            }}
            hours={{ href: hoursHref, label: hoursLabel }}
            listHref="/bookings/all"
            start={opens.start}
            onStart={(start) => void change({ start })}
            showFor={opens.showFor}
            onShowFor={pickShowFor}
            google={
                google
                    ? {
                          ...google,
                          mine: me !== null,
                          team: others.map((c) => ({
                              key: c.key,
                              name: c.name,
                              state:
                                  google.people.find((p) => p.staffId === c.key)
                                      ?.state ?? "NONE",
                          })),
                          you: me?.id ?? null,
                      }
                    : null
            }
            me={me ? callName(me.name) : null}
            whoNow={everyone ? "everyone" : whoName}
            zone={zone}
        />
    );

    const todayHref = hrefFor(layout, today);
    const prevHref = hrefFor(layout, addDays(date, -step));
    const nextHref = hrefFor(layout, addDays(date, step));

    const phoneFrame = (onPhone: boolean, both: boolean) => {
        // BKVCalendarBPhone: Calendar | List and "…" first (the List's
        // row too), then the date naming its view, Today when away from
        // today, whose bookings with the summary, and the week strip.
        return (
            // `contents`: the sticky Calendar | List row sticks across the
            // whole screen, not only while this header is in view.
            <div
                data-calendar-header="phone"
                className={cn("contents", both && "min-[760px]:hidden")}
            >
                <BookingsPhoneBar current="calendar" options={options} />
                <div className="flex min-w-0 items-center gap-2 pt-1">
                    <h1 className="m-0 flex min-w-0 flex-1">
                        <DateSheet
                            open={open === "date"}
                            onOpenChange={toggle("date")}
                            trigger={titleButton(onPhone)}
                            title={title}
                            layout={layout}
                            date={date}
                            today={today}
                            facts={facts}
                            start={opens.start}
                            hrefFor={(l, d) => hrefFor(l, d, picked)}
                            onGo={go}
                        />
                    </h1>
                    {date === today ? null : (
                        <IntentLink
                            href={todayHref}
                            onNavigate={screenLink(todayHref)}
                            scroll={false}
                            data-today-button=""
                            data-ph-unmask=""
                            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[14px] font-semibold text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[359px]:px-0"
                        >
                            <CalendarDays aria-hidden className="size-4" />
                            {/* At 320 the date keeps its room: the icon alone. */}
                            <span className="max-[359px]:sr-only">Today</span>
                        </IntentLink>
                    )}
                </div>
                {/* For a keyboard and a screen reader: swipe is the touch. */}
                <IntentLink
                    href={prevHref}
                    onNavigate={screenLink(prevHref)}
                    scroll={false}
                    aria-label={`Previous ${unit}`}
                    className={cn(STEP, PHONE_STEP)}
                >
                    <ChevronLeft aria-hidden className="size-4" />
                </IntentLink>
                <IntentLink
                    href={nextHref}
                    onNavigate={screenLink(nextHref)}
                    scroll={false}
                    aria-label={`Next ${unit}`}
                    className={cn(STEP, PHONE_STEP)}
                >
                    <ChevronRight aria-hidden className="size-4" />
                </IntentLink>
                <div className="flex min-h-11 min-w-0 items-center gap-2 text-[13.5px] tabular-nums text-foreground/80">
                    {loadingPeople ? (
                        <Skeleton
                            aria-hidden
                            className="h-11 w-32 shrink-0 rounded-full"
                        />
                    ) : null}
                    {showChip && chip ? (
                        <PeopleSheet
                            open={open === "people"}
                            onOpenChange={toggle("people")}
                            trigger={chip}
                            period={period}
                            periodWord={periodWord}
                            choices={choices ?? []}
                            picked={everyone ? EVERYONE : picked}
                            showFor={opens.showFor}
                            onPick={pickPerson}
                            onAdd={onAddPerson}
                        />
                    ) : null}
                    <span role="status" className="min-w-0 flex-1">
                        {summary}
                    </span>
                </div>
                <WeekStrip
                    layout={layout}
                    date={date}
                    today={today}
                    facts={facts}
                    hrefFor={(l, d) => hrefFor(l, d)}
                />
                {calOnly ? (
                    <p
                        data-ph-unmask=""
                        className="m-0 pt-2 text-[12.5px] text-muted-foreground"
                    >
                        Your role sees the calendar only, so you can't book or
                        change bookings. An owner can change this in Settings ›
                        Team.
                    </p>
                ) : null}
                {newBooking}
                <span aria-hidden className="block h-3" />
            </div>
        );
    };

    const deskFrame = (onPhone: boolean, both: boolean) => (
        <div
            data-calendar-header="desk"
            className={cn(
                both && "max-[759px]:hidden",
                "relative mb-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 max-[759px]:mb-3 max-[759px]:gap-x-2 max-[759px]:gap-y-0 max-[759px]:border-b max-[759px]:border-border max-[759px]:pb-0.5",
            )}
        >
            <IntentLink
                href={hrefFor(layout, today)}
                onNavigate={screenLink(hrefFor(layout, today))}
                scroll={false}
                data-today-button=""
                data-ph-unmask=""
                className="order-1 inline-flex h-[38px] shrink-0 items-center rounded-[8px] border border-border bg-card px-3 text-[13.5px] font-semibold text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11 max-[759px]:order-3 max-[759px]:h-11 max-[759px]:rounded-full"
            >
                Today
            </IntentLink>
            <IntentLink
                href={hrefFor(layout, addDays(date, -step))}
                onNavigate={screenLink(hrefFor(layout, addDays(date, -step)))}
                scroll={false}
                aria-label={`Previous ${unit}`}
                className={cn(STEP, PHONE_STEP, "order-1")}
            >
                <ChevronLeft aria-hidden className="size-4" />
            </IntentLink>
            <IntentLink
                href={hrefFor(layout, addDays(date, step))}
                onNavigate={screenLink(hrefFor(layout, addDays(date, step)))}
                scroll={false}
                aria-label={`Next ${unit}`}
                className={cn(
                    STEP,
                    PHONE_STEP,
                    "order-1 -ml-1 max-[759px]:ml-0",
                )}
            >
                <ChevronRight aria-hidden className="size-4" />
            </IntentLink>

            <h1 className="order-2 m-0 flex min-w-0 max-[759px]:flex-1">
                <DateSheet
                    open={open === "date"}
                    onOpenChange={toggle("date")}
                    trigger={titleButton(onPhone)}
                    title={title}
                    layout={layout}
                    date={date}
                    today={today}
                    facts={facts}
                    start={opens.start}
                    hrefFor={(l, d) => hrefFor(l, d, picked)}
                    onGo={go}
                />
            </h1>
            <span
                data-view-name=""
                className="order-2 -ml-1 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12.5px] font-medium text-muted-foreground max-[759px]:hidden"
            >
                {VIEW_NAME[layout]}
            </span>

            {loadingPeople ? (
                <Skeleton
                    aria-hidden
                    className="order-3 h-[38px] w-32 rounded-full max-[759px]:h-11"
                />
            ) : null}
            {showChip && chip ? (
                <div className="order-3">
                    <PeopleSheet
                        open={open === "people"}
                        onOpenChange={toggle("people")}
                        trigger={chip}
                        period={period}
                        periodWord={periodWord}
                        choices={choices ?? []}
                        picked={everyone ? EVERYONE : picked}
                        showFor={opens.showFor}
                        onPick={pickPerson}
                        onAdd={onAddPerson}
                    />
                </div>
            ) : null}

            {/* A phone's own line break: the summary starts the second row. */}
            <span
                aria-hidden
                className="order-4 hidden basis-full max-[759px]:block"
            />

            <div className="order-6 flex min-h-11 basis-full items-center gap-2 text-[13px] tabular-nums text-muted-foreground max-[759px]:order-5 max-[759px]:min-w-0 max-[759px]:flex-1 max-[759px]:basis-auto max-[759px]:text-[13.5px] max-[759px]:text-foreground/80 min-[760px]:min-h-0 min-[760px]:pl-[84px]">
                <span role="status" className="min-w-0 max-[759px]:flex-1">
                    {summary}
                </span>
                <span aria-hidden className="max-[759px]:hidden">
                    ·
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap max-[759px]:hidden">
                    <Globe aria-hidden className="size-[13px]" />
                    Times in {zone}
                </span>
                {remembered ? (
                    <>
                        <span aria-hidden className="max-[759px]:hidden">
                            ·
                        </span>
                        <span className="max-[759px]:hidden">{remembered}</span>
                    </>
                ) : null}
            </div>

            <div className="order-5 ml-auto flex items-center gap-2 max-[759px]:order-6 max-[759px]:ml-0">
                <BookingsModeSwitch current="calendar" />
                {options}
                {newBooking}
            </div>

            {layout === "week" ? null : (
                <WeekStrip
                    layout={layout}
                    date={date}
                    today={today}
                    facts={facts}
                    hrefFor={(l, d) => hrefFor(l, d)}
                />
            )}

            {calOnly ? (
                <p
                    data-ph-unmask=""
                    className="order-7 m-0 basis-full text-[12.5px] text-muted-foreground max-[759px]:pb-2 min-[760px]:pl-[84px]"
                >
                    Your role sees the calendar only, so you can't book or
                    change bookings. An owner can change this in Settings ›
                    Team.
                </p>
            ) : null}
        </div>
    );

    // Each frame keeps its place, so the one in use is the same element
    // before and after hydration: never remounted, a press never lost.
    const both = known === null;
    return (
        <>
            {known === false ? null : phoneFrame(true, both)}
            {known === true ? null : deskFrame(false, both)}
        </>
    );
}
