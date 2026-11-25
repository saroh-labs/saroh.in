"use client";

import { formatDay, timeZoneName } from "@/lib/format/datetime";
import { PartialRead } from "@saroh/ui/failed-read";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import type { CalendarBusy } from "@/lib/google-calendar/types";
import type { NoticeChannels } from "@/lib/messages/notice-reach";
import type { BookingsCalendar } from "@/lib/services/booking-calendar";
import type { BookingPeople } from "@/lib/services/booking-pay";
import type { BookingsOpens } from "@/lib/services/bookings-opens";
import { EVERYONE, OPENS_DEFAULT } from "@/lib/services/bookings-opens";
import { busySpans } from "@/lib/services/busy-blocks";
import type { CalendarLayout, GoogleShow } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import { firstDayName, isFirstDay } from "@/lib/services/day-view";
import type {
    Block,
    LocalDate,
    ServiceHours,
    Span,
} from "@/lib/services/diary";
import { addDays } from "@/lib/services/diary";
import type { Service } from "@/lib/services/service";
import type { BookingRules, StaffView } from "@/lib/staff/types";

import { NewBookingFromGap } from "@/components/bookings/free-time/new-booking-from-gap";
import { OpenHoursDialog } from "@/components/bookings/free-time/open-hours-dialog";
import { useGapTargets } from "@/components/bookings/free-time/use-gap-targets";
import { BookingQuickLook } from "@/components/bookings/quick-look/booking-quick-look";
import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import {
    PendingRegion,
    useScreenGo,
} from "@/components/shared/page/screen-pending";
import { PROFILE } from "@/lib/edition";
import { TextLink } from "@saroh/ui/text-link";
import { AddPersonDialog } from "../availability/add-person-dialog";
import { DayByPerson } from "./day-by-person";
import {
    DayFoot,
    FirstDayHelp,
    NobodyTakesBookings,
    ServiceHoursNote,
} from "./day-states";
import { CalendarHeader } from "./header/calendar-header";
import { useSwipe } from "./header/use-swipe";
import { ListView } from "./list/list-view";
import { useOpeningView } from "./list/use-opening-view";
import { useCalendarActions, withOverrides } from "./use-calendar-actions";
import { useCalendarDays } from "./use-calendar-days";
import { WeekPhone } from "./week-phone";
import { WeekView } from "./week-view";

// The calendar's address lives in a plain module so the server page can
// build it too; a server component can't call into this client file.
export { calendarHref, type CalendarLayout, type GoogleShow };

/**
 * Bookings › Calendar (U15, the "Saroh Bookings" design): the day by person
 * (default), the week, or the agenda with the month. Everything is read from
 * the bookings read (U4) and the staff read (U3); free gaps are what is left
 * of each person's hours. A booking opens a quick look; a free gap books;
 * closed time opens hours. Changes the desk makes are held for their Undo.
 *
 * Bookings are the only solid colour: free time is the plain page, closed
 * time and time off are hatched, and cancelled bookings stay off the diary
 * until the count's switch asks for them (kept in the address, so a reload
 * remembers). The hours drawn are trimmed to the day's own.
 */
export function CalendarScreen({
    layout,
    date,
    today,
    now,
    timezone,
    calendar: given,
    staff,
    services,
    rules,
    people,
    can,
    newBooking,
    notices = null,
    limitNotice = null,
    calendarLine = null,
    serviceHours = null,
    showCancelled = false,
    person: askedPerson = EVERYONE,
    opens = OPENS_DEFAULT,
    me = null,
    share = null,
    listFirst = false,
    business = null,
    googleBusy = null,
    googleShow = "all",
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    now: number;
    timezone: string;
    /**
     * Null until the first read lands (owner, 25 Nov): the header and its
     * controls are here and work, the diary is its skeleton, the summary
     * and the counts wait.
     */
    calendar: BookingsCalendar | null;
    /** Null when the staff read failed: no hours, so no free times. */
    staff: StaffView[] | null;
    services: Service[];
    rules: BookingRules | null;
    /** What New booking may do about the customer and a pay link (E4). */
    people: BookingPeople;
    can: {
        book: boolean;
        /** Open closed time, block time: hours and time off. */
        hours: boolean;
        /** Add someone who takes bookings; else as `hours`. */
        addPeople?: boolean;
        order?: boolean;
        /** `payment:manage`: may change what a cancel does with the money. */
        refund?: boolean;
        /** Take payment at the desk, and send a pay link instead (P2). */
        desk?: {
            canTake: boolean;
            canLink: boolean;
            /** The plan takes payment online (R33); else no link is offered. */
            online?: boolean;
        };
    };
    /** The full New booking dialog, for any service at any open time. */
    newBooking: ReactNode;
    /** What the business can tell its customers with (A14). */
    notices?: NoticeChannels | null;
    /** The plan's bookings-a-month notice at 80% and 100% (U14). */
    limitNotice?: ReactNode;
    /**
     * The person's own Google Calendar, Connect or a lapsed account
     * (`GoogleCalendarLine`): shown only while the page says nothing else.
     * Null while the plan's notice is up.
     */
    calendarLine?: ReactNode;
    /**
     * With nobody on the diary, the services' own hours (UX-023): drawn as
     * one column with its free time, as the booking page offers it.
     */
    serviceHours?: ServiceHours | null;
    /** The address asks for cancelled bookings to be drawn (`cancelled=1`). */
    showCancelled?: boolean;
    /** Whose bookings are shown: a staff id, or `EVERYONE` (DEC-170). */
    person?: string;
    /** Where Bookings opens for this person, as kept (DEC-170). */
    opens?: BookingsOpens;
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me?: { id: string; name: string } | null;
    /** "Share your booking page" on a quiet List day, while it is live. */
    share?: ReactNode;
    /** Nothing chose the view: a phone opens on List (Q4, U6). */
    listFirst?: boolean;
    /** The business, as its customers know it, for a booked message (U9). */
    business?: string | null;
    /**
     * Everyone's Google busy times for this week (start and end, never a
     * title) and who is connected; null when Google Calendar is off for the
     * business or couldn't be read, and nothing is drawn.
     */
    googleBusy?: CalendarBusy | null;
    /** The Google layer in What to show: everyone's, just mine, or hidden. */
    googleShow?: GoogleShow;
}) {
    const loading = given === null;
    const read = useMemo(
        () => given ?? { ...NO_CALENDAR, timezone },
        [given, timezone],
    );
    // Flipped here and written to the address without a round trip; a
    // navigation that changes what the address says wins.
    const [cancelledShown, setCancelledShown] = useState(showCancelled);
    const [asked, setAsked] = useState(showCancelled);
    if (asked !== showCancelled) {
        setAsked(showCancelled);
        setCancelledShown(showCancelled);
    }
    const [googleMode, setGoogleMode] = useState<GoogleShow>(googleShow);
    const [peek, setPeek] = useState<string | null>(null);
    const [addingPerson, setAddingPerson] = useState(false);
    // A phone that nothing has chosen a view for opens on List (Q4, U6);
    // else "Where I left it" (Q15): this device keeps the view it was left on.
    const screenGo = useScreenGo();
    const replace = useCallback(
        (href: string) => screenGo(href, "replace"),
        [screenGo],
    );
    useOpeningView({
        layout,
        listFirst,
        listHref: calendarHref("agenda", date, {
            cancelled: showCancelled,
            person: askedPerson,
        }),
        replace,
    });

    const staffById = useMemo(
        () => new Map((staff ?? []).map((p) => [p.id, p])),
        [staff],
    );
    // What the desk does, each held for its Undo, shown over the read.
    const { overrides, act, heldFor } = useCalendarActions({
        now,
        timezone,
        money: read.money,
        rules,
    });
    const calendar = useMemo(
        () => withOverrides(read, overrides),
        [read, overrides],
    );
    const money = calendar.money;
    // What the day or week draws, its totals, and the header's facts.
    const {
        person,
        columns,
        dayBlocks,
        week,
        weekStart,
        inWeek,
        span,
        summary,
        cancelledCount,
        everyBlock,
        facts,
        choices,
    } = useCalendarDays({
        calendar,
        staff,
        staffById,
        services,
        layout,
        date,
        today,
        timezone,
        serviceHours,
        cancelledShown,
        askedPerson,
    });

    // Google busy times, as spans of the day or of each day of the week.
    const busyFor = useCallback(
        (day: LocalDate, keys: readonly string[] | null) => {
            if (!googleBusy?.on || googleMode === "off") return [];
            const only = googleMode === "mine" ? me?.id : null;
            if (googleMode === "mine" && !only) return [];
            const ids = keys
                ? new Set(keys.filter((k) => !only || k === only))
                : only
                  ? new Set([only])
                  : null;
            return busySpans(googleBusy.busy, ids, day, timezone, span);
        },
        [googleBusy, googleMode, me, timezone, span],
    );
    const dayBusy = useMemo(
        () => ({
            byColumn: new Map<string, readonly Span[]>(
                columns.map((c) => [c.key, busyFor(date, [c.key])]),
            ),
            all: busyFor(
                date,
                columns.map((c) => c.key),
            ),
        }),
        [columns, busyFor, date],
    );
    const weekDrawn = useMemo(
        () =>
            week.map((d) => ({
                ...d,
                busy: busyFor(
                    d.date,
                    d.cols.map((c) => c.key),
                ),
            })),
        [week, busyFor],
    );

    // From everything on the view, drawn or not: a booking cancelled from
    // its quick look leaves the diary, and the quick look keeps its Undo.
    const peekBlock = peek
        ? (everyBlock.find((b) => b.key === peek) ??
          // A block opened from the week that is not on the day.
          week.flatMap((d) => d.every).find((b) => b.key === peek) ??
          null)
        : null;

    // Free gaps and closed time: the sheets they open.
    const {
        gap,
        hours,
        closeGap,
        closeHours,
        bookGap,
        openDay,
        offersFree,
        openClosed,
    } = useGapTargets({ date, person, me, staff, staffById });

    const hrefFor = (l: CalendarLayout, d: LocalDate, who = person) =>
        calendarHref(l, d, {
            cancelled: cancelledShown,
            person: who,
            google: googleMode,
        });
    // In the screen's transition: the diary greys, the header stays.
    const go = (l: CalendarLayout, d: LocalDate) => screenGo(hrefFor(l, d));
    const step = inWeek ? 7 : 1;
    const swipe = useSwipe({
        onPrevious: () => go(layout, addDays(date, -step)),
        onNext: () => go(layout, addDays(date, step)),
    });
    // Nothing is read again for it, so the address is written in place
    // (Next keeps `history.replaceState` in step with its router).
    const showCancelledBookings = (on: boolean) => {
        setCancelledShown(on);
        window.history.replaceState(
            null,
            "",
            calendarHref(layout, date, {
                cancelled: on,
                person,
                google: googleMode,
            }),
        );
    };

    const showGoogle = (mode: GoogleShow) => {
        setGoogleMode(mode);
        const url = new URL(window.location.href);
        if (mode === "all") url.searchParams.delete("google");
        else url.searchParams.set("google", mode === "off" ? "0" : mode);
        window.history.replaceState(null, "", url.toString());
    };

    const nobodyYet =
        staff !== null &&
        !staff.some((p) => p.status === "ACTIVE") &&
        columns.length > 0;
    const ownHours = serviceHours !== null && serviceHours.hours.length > 0;
    const canAddPeople = can.addPeople ?? can.hours;
    const addPerson = canAddPeople ? () => setAddingPerson(true) : undefined;
    // The first day's help (U4): nothing booked yet and time to book.
    const firstDay =
        layout === "day" && can.book && isFirstDay(calendar, columns);
    const shownPerson = person === EVERYONE ? null : person;
    const peekFromDay = (b: Block) => setPeek(b.key);

    return (
        <div>
            <CalendarHeader
                layout={layout}
                date={date}
                today={today}
                summary={loading ? <FigureLoading className="w-48" /> : summary}
                zone={timeZoneName(
                    timezone,
                    "short",
                    new Date(now),
                    PROFILE.numberLocale,
                )}
                choices={loading ? null : choices}
                picked={person}
                facts={facts}
                cancelled={{
                    count: loading ? null : cancelledCount,
                    shown: cancelledShown,
                    onChange: showCancelledBookings,
                }}
                opens={opens}
                me={me}
                hrefFor={hrefFor}
                newBooking={newBooking}
                calOnly={!can.book}
                onAddPerson={addPerson}
                google={
                    googleBusy?.on
                        ? {
                              show: googleMode,
                              onChange: showGoogle,
                              people: googleBusy.people,
                          }
                        : null
                }
            />
            <PendingRegion>
                <div className="max-[759px]:touch-pan-y" {...swipe}>
                    {limitNotice ? (
                        <div className="mb-3">{limitNotice}</div>
                    ) : null}
                    {loading ? (
                        <PageLoading
                            bare
                            width="full"
                            shape={layout === "agenda" ? "rows" : "diary"}
                            label="Loading the calendar"
                        />
                    ) : null}
                    {!loading && staff === null ? (
                        <PartialRead
                            className="mb-3"
                            things="hours and time off"
                            so="Open and closed times aren't shown. The bookings below are complete."
                        />
                    ) : null}

                    {nobodyYet && ownHours ? (
                        // How the one column works, said once, with the action.
                        <ServiceHoursNote onAdd={addPerson} />
                    ) : nobodyYet && layout === "day" ? (
                        <div className="mb-3">
                            <NobodyTakesBookings onAdd={addPerson} />
                        </div>
                    ) : nobodyYet ? (
                        <p className="mb-3 text-[12.5px] text-muted-foreground">
                            Nobody is on the diary and no service has hours of
                            its own yet, so customers have no free times to
                            book.{" "}
                            {addPerson ? (
                                <TextLink
                                    data-ph-unmask=""
                                    onClick={addPerson}
                                    className="coarse:min-h-11"
                                >
                                    Add who takes bookings
                                </TextLink>
                            ) : null}
                        </p>
                    ) : null}
                    {/* One message at a time: the plan, a partial read and
                    nobody on the diary come first, and the first day's
                    help (U4). */}
                    {calendarLine &&
                    !loading &&
                    staff !== null &&
                    !nobodyYet &&
                    !firstDay ? (
                        <div className="mb-3">{calendarLine}</div>
                    ) : null}
                    {layout === "day" && !loading ? (
                        <>
                            {firstDay ? (
                                <FirstDayHelp
                                    name={firstDayName(columns)}
                                    hoursHref={
                                        can.hours
                                            ? shownPerson
                                                ? `/bookings/availability?person=${encodeURIComponent(shownPerson)}`
                                                : "/bookings/availability"
                                            : null
                                    }
                                />
                            ) : null}
                            {columns.length ? (
                                <DayByPerson
                                    columns={columns}
                                    span={span}
                                    today={date === today}
                                    timezone={timezone}
                                    sightKey={`day:${date}`}
                                    everyone={person === EVERYONE}
                                    selected={peek}
                                    canBook={can.book}
                                    canOpenHours={can.hours}
                                    dayText={formatDay(date, {
                                        weekday: "short",
                                        year: "never",
                                    })}
                                    onBlock={peekFromDay}
                                    onFree={bookGap}
                                    onClosed={openClosed}
                                    busy={dayBusy}
                                />
                            ) : (
                                <NobodyTakesBookings onAdd={addPerson} />
                            )}
                            {columns.length ? (
                                <DayFoot first={firstDay} />
                            ) : null}
                        </>
                    ) : null}

                    {layout === "week" && !loading ? (
                        <>
                            <div className="max-[759px]:hidden">
                                <WeekView
                                    days={weekDrawn}
                                    span={span}
                                    timezone={timezone}
                                    sightKey={`week:${weekStart}`}
                                    selected={peek}
                                    canBook={can.book}
                                    canOpenHours={can.hours}
                                    offersFree={offersFree}
                                    onDay={(d) => go("day", d)}
                                    onBlock={(b) => setPeek(b.key)}
                                    onFree={bookGap}
                                    onOpenDay={openDay}
                                />
                            </div>
                            <div className="min-[760px]:hidden">
                                <WeekPhone
                                    days={week}
                                    date={date}
                                    person={
                                        person === EVERYONE
                                            ? null
                                            : (staffById.get(person)?.name ??
                                              columns.at(0)?.name ??
                                              null)
                                    }
                                    canBook={can.book}
                                    canOpenHours={can.hours}
                                    offersFree={offersFree}
                                    selected={peek}
                                    onPick={(d) => go("week", d)}
                                    onBlock={(b) => setPeek(b.key)}
                                    onFree={bookGap}
                                    onOpenDay={openDay}
                                />
                            </div>
                        </>
                    ) : null}

                    {layout === "agenda" && !loading ? (
                        <ListView
                            blocks={dayBlocks}
                            columns={columns}
                            staff={staff}
                            person={
                                person === EVERYONE
                                    ? null
                                    : (columns[0]?.name ?? null)
                            }
                            date={date}
                            today={today}
                            now={now}
                            timezone={timezone}
                            selected={peek}
                            canBook={can.book}
                            canHours={can.hours}
                            share={share}
                            onBlock={peekFromDay}
                            onFree={bookGap}
                            onOpenDay={() => openDay(date)}
                        />
                    ) : null}
                </div>
            </PendingRegion>

            <BookingQuickLook
                block={peekBlock}
                onClose={() => setPeek(null)}
                ctx={{
                    timezone,
                    now,
                    money,
                    rules,
                    canBook: can.book,
                    canRefund: can.refund ?? false,
                    canEditService: can.addPeople ?? false,
                    // Someone else's booking is given away with
                    // `service:write` (#1157); else only their own.
                    reassign: {
                        any: can.addPeople ?? false,
                        me: me?.id ?? null,
                    },
                    canReadOrder: can.order ?? false,
                    desk: can.desk,
                    notices,
                }}
                act={act}
                heldFor={heldFor}
            />
            <NewBookingFromGap
                target={gap}
                services={services}
                people={people}
                timezone={timezone}
                today={today}
                money={money}
                canHours={can.hours}
                business={business}
                onClose={closeGap}
            />
            <OpenHoursDialog
                target={hours}
                today={today}
                onClose={closeHours}
            />
            {/* Adding someone is a name and what they do, so it is done
                here; the dialog refreshes the calendar, which gives them
                their column. They start with the opening hours, and
                Availability is where their week is changed. */}
            {canAddPeople ? (
                <AddPersonDialog
                    open={addingPerson}
                    onOpenChange={setAddingPerson}
                    hoursHint="Change their hours in Hours and time off."
                />
            ) : null}
        </div>
    );
}

/** Nothing read yet: no days, so no day knows its count (`dayFactsOf`). */
const NO_CALENDAR: BookingsCalendar = {
    from: "",
    to: "",
    timezone: "",
    money: false,
    diaries: [],
};
