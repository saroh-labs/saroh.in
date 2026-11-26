"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { ListTable, listTable, ListTableHead } from "@saroh/ui/list-table";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { CalendarDays } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { TakePayment } from "@/components/bookings/booking-page/take-payment";
import { useCalendarActions } from "@/components/bookings/calendar/use-calendar-actions";
import { BookingQuickLook } from "@/components/bookings/quick-look/booking-quick-look";
import { CancelSheet } from "@/components/bookings/sheets/cancel-sheet";
import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import {
    PendingRegion,
    useScreenGo,
} from "@/components/shared/page/screen-pending";
import { ShareLinkButton } from "@/components/shared/share-link/share-link-button";
import { useHold } from "@/components/shared/undo/use-hold";
import { UNREACHED } from "@/lib/api/unreached";
import { useBookingSave } from "@/lib/bookings/use-bookings";
import { personHref } from "@/lib/contacts/person-href";
import { formatDateTime } from "@/lib/format/datetime";
import type { NoticeChannels } from "@/lib/messages/notice-reach";
import { firstName } from "@/lib/names";
import { recordBookingOutcome } from "@/lib/services/actions";
import type {
    MoreFilters,
    Order,
    RowAbilities,
    ViewId,
} from "@/lib/services/all-bookings";
import {
    asksOutcome,
    defaultOrder,
    emptyView,
    foldsIn,
    groupByDay,
    inView,
    matchesMore,
    matchesSearch,
    moreChoices,
    moreCount,
    NO_MORE,
    NOBODY_ELSE_TODAY,
    ordered,
    personLabel,
    readView,
    rowMenu,
    rowStatus,
    STATUS_PICKS,
    takeLabel,
    viewCounts,
    VIEWS,
    withFolds,
} from "@/lib/services/all-bookings";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { BookingOutcome } from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { Block } from "@/lib/services/diary";
import {
    bookingState,
    localDateOf,
    localMinuteOf,
    whoFor,
} from "@/lib/services/diary";
import {
    countedWords,
    countItems,
    listItems,
} from "@/lib/services/session-counts";
import { zoneShortName } from "@/lib/services/time-picker";
import type { ShareLink } from "@/lib/sites/share-links";
import type { BookingRules } from "@/lib/staff/types";
import type { DateRange } from "@/lib/views/date-range";
import {
    dateRangeOn,
    NO_DATE_RANGE,
    writeDateRange,
} from "@/lib/views/date-range";
import { BookingRow, ROW_GRID } from "./booking-row";
import { ClassRow } from "./class-row";
import {
    FoldLine,
    NarrowPill,
    SearchToggle,
    ShowingPicker,
} from "./list-header";
import { BookingFilters, datesWords } from "./more-filters";
import { MoveSheet } from "./move-sheet";

/**
 * All bookings (U11; BKMAllBookings on a phone, BKDAllBookings at a desk):
 * the register behind the calendar, kept whole because its views answer
 * questions a diary does not — what's coming, what's waiting to be
 * marked, what's awaiting payment.
 *
 * - The views are one picker, "Showing: Upcoming 2 ▾" (Upcoming, Needs an
 *   outcome, Awaiting payment, Today, Next 7 days, All, each with its
 *   count; BLHB variant B). Search is an icon; one Filters button holds
 *   Sort, Dates, Whose bookings, Service and Status. `?view=` names the
 *   view, as Home's links do. Counts hold only bookings still on: each
 *   day's cancelled ones fold under it ("2 cancelled · Show").
 * - Rows sit under day headings ("Today · Mon 19 Oct", "Earlier today"),
 *   every time in the business's zone, labelled ("When · IST", Q10).
 * - A booking that has ended unmarked asks "Did they come?" in its Status:
 *   Came or Didn't come, held ten seconds with Undo. Owners and admins
 *   also see a Money column (DEC-098: it follows `payment:read`).
 * - Each row's menu: Mark arrived, Take ₹X, Move to another time, Open the
 *   booking, Open their page, Cancel booking. Every cancel goes through the
 *   one cancel sheet (U3), which asks about the money (BA-01).
 */

/** The business's zone, the viewer's permissions and the desk's ways to pay. */
export interface AllBookingsCan extends RowAbilities {
    /** `payment:manage`: may refund what the policy keeps. */
    refund: boolean;
    /** `order:read`: a treatment's visit links to its order. */
    readOrder: boolean;
    /** Reads money (DEC-098, DEC-274): the Money column. */
    money: boolean;
    /** A payment link may be sent from Take ₹X. */
    link: boolean;
    /** The plan takes payment online. */
    online: boolean;
    /** `service:write`: give anyone's booking to someone else (#1157). */
    assign?: boolean;
}

const EMPTY_LINE =
    "They show here when a customer books from your booking page, or when you add one.";

export function BookingsView({
    bookings: read,
    timezone,
    now,
    initialView,
    can,
    share = null,
    dates = NO_DATE_RANGE,
    me = null,
    showCancelled = false,
    initialStaff = null,
    rules = null,
    notices = null,
}: {
    /**
     * Null until the first read lands: the controls are here and work,
     * the rows are skeletons, the counts wait (owner, 25 Nov).
     */
    bookings: DiaryBooking[] | null;
    /** The business's zone: every time is read in it (Q10). */
    timezone: string;
    /** The server's now, so the first render and the browser agree. */
    now: number;
    initialView?: string;
    can: AllBookingsCan;
    /**
     * The date filter the address asks for (`?date=`, Orders' params):
     * `bookings` are already the API's for those days.
     */
    dates?: DateRange;
    /**
     * A business with no bookings yet is offered "Share your booking page"
     * while the page is live (DEC-069, L8); null leaves it out.
     */
    share?: ShareLink | null;
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me?: { id: string; name: string } | null;
    /** "Show cancelled bookings" in the "…" sheet: every day's fold is open. */
    showCancelled?: boolean;
    /** "Show bookings for" opens on this person (Just me, or the last pick). */
    initialStaff?: string | null;
    /** The business's booking rules: the quick look's free-cancel window. */
    rules?: BookingRules | null;
    /** What the business can tell its customers with (A14). */
    notices?: NoticeChannels | null;
}) {
    const loading = read === null;
    // The quick look's changes, each held for its Undo, shown over the read
    // as on the Calendar.
    const { overrides, act, heldFor } = useCalendarActions({
        now,
        timezone,
        money: can.money,
        rules,
    });
    const bookings = useMemo(
        () =>
            (read ?? NO_BOOKINGS).map((b) =>
                b.id in overrides ? { ...b, ...overrides[b.id] } : b,
            ),
        [read, overrides],
    );
    // The booking whose quick look is open (a row's press, as on the Calendar).
    const [peekId, setPeekId] = useState<string | null>(null);
    const peekBooking = peekId
        ? (bookings.find((b) => b.id === peekId) ?? null)
        : null;
    const go = useScreenGo();
    const { save, saved } = useBookingSave();
    const [view, setViewState] = useState<ViewId>(() => readView(initialView));
    const [term, setTerm] = useState("");
    const [searchKey, setSearchKey] = useState(0);
    const [more, setMore] = useState<MoreFilters>({
        ...NO_MORE,
        staff: initialStaff,
    });
    const [orderPick, setOrderPick] = useState<Order | null>(null);
    // Days whose cancelled bookings are shown ("2 cancelled · Show").
    const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
    const order = orderPick ?? defaultOrder(view);

    // Came / Didn't come, shown at once and held ten seconds with Undo.
    const { hold, send, undo, pending } = useHold();
    const [marks, setMarks] = useState<Partial<Record<string, BookingOutcome>>>(
        {},
    );
    const [cancelling, setCancelling] = useState<DiaryBooking | null>(null);
    const [moving, setMoving] = useState<DiaryBooking | null>(null);
    const [taking, setTaking] = useState<DiaryBooking | null>(null);
    const triggers = useRef(new Map<string, HTMLButtonElement>());
    // The row whose menu opened the sheet: the keyboard goes back to its
    // ⋯ when the sheet closes (read after the sheet's own state is gone).
    const lastRow = useRef<string | null>(null);
    const backToRow = () =>
        lastRow.current ? triggers.current.get(lastRow.current) : null;

    const zoneLabel = zoneShortName(timezone, now);

    const setView = (next: ViewId) => {
        setViewState(next);
        setOrderPick(null);
        // The address keeps the view, without a trip to the server.
        const url = new URL(window.location.href);
        if (next === "upcoming") url.searchParams.delete("view");
        else url.searchParams.set("view", next);
        window.history.replaceState(null, "", url.toString());
    };

    const narrowed = useMemo(
        () =>
            bookings.filter(
                (b) => matchesSearch(b, term) && matchesMore(b, more, now),
            ),
        [bookings, term, more, now],
    );
    const counts = useMemo(
        () => viewCounts(narrowed, now, timezone),
        [narrowed, now, timezone],
    );
    const shown = useMemo(
        () =>
            ordered(
                narrowed.filter((b) => inView(view, b, now, timezone)),
                order,
            ),
        [narrowed, view, now, timezone, order],
    );
    const folded = useMemo(
        () => narrowed.filter((b) => foldsIn(view, b, now, timezone)),
        [narrowed, view, now, timezone],
    );
    const choices = useMemo(() => moreChoices(bookings), [bookings]);
    const { rows: pageRows, paging } = useLocalPages("bookings", shown, {
        label: "Pages of bookings",
        resetOn: `${view}|${term}|${JSON.stringify(more)}|${order}`,
    });
    const groups = useMemo(
        () =>
            withFolds(
                groupByDay(pageRows, timezone, now),
                folded,
                timezone,
                now,
            ),
        [pageRows, folded, timezone, now],
    );
    const today = localDateOf(new Date(now), timezone);

    const searching = term.trim() !== "";
    const dated = dateRangeOn(dates);
    const filtering = moreCount(more) > 0 || dated;
    const narrowedBy = moreCount(more) + (dated ? 1 : 0);
    const viewLabel = VIEWS.find((v) => v.id === view)?.label ?? "Upcoming";
    const staffName = (id: string) =>
        id === me?.id
            ? "Just me"
            : (choices.staff.find((c) => c.value === id)?.label ?? "");
    const serviceName = (id: string) =>
        choices.services.find((c) => c.value === id)?.label ?? "";
    const pills: { key: string; text: string; remove: () => void }[] = [
        ...(more.staff
            ? [
                  {
                      key: "staff",
                      text: `With: ${staffName(more.staff)}`,
                      remove: () => setMore({ ...more, staff: null }),
                  },
              ]
            : []),
        ...(more.service
            ? [
                  {
                      key: "service",
                      text: `Service: ${serviceName(more.service)}`,
                      remove: () => setMore({ ...more, service: null }),
                  },
              ]
            : []),
        ...more.statuses.map((st) => ({
            key: `status:${st}`,
            text: `Status: ${STATUS_PICKS.find((o) => o.value === st)?.label ?? st}`,
            remove: () =>
                setMore({
                    ...more,
                    statuses: more.statuses.filter((x) => x !== st),
                }),
        })),
        ...(dated
            ? [
                  {
                      key: "dates",
                      text: `Dates: ${datesWords(dates, today) ?? ""}`,
                      remove: () => pickDates(NO_DATE_RANGE),
                  },
              ]
            : []),
    ];

    // The date filter is read for those days, so a change goes by the
    // address (in place on React Query); the view, the search and the rest
    // stay as they are.
    const pickDates = (patch: Partial<DateRange>) => {
        const url = new URL(window.location.href);
        writeDateRange({ ...dates, ...patch }, url.searchParams);
        go(`${url.pathname}${url.search}`, "replace");
    };
    const clearAll = () => {
        setTerm("");
        setSearchKey((k) => k + 1);
        setMore(NO_MORE);
        if (dates.date) pickDates(NO_DATE_RANGE);
    };

    const mark = (b: DiaryBooking, outcome: BookingOutcome) => {
        const key = `outcome:${b.id}`;
        const was = marks[b.id];
        // Undone or refused: back to what it was, unless a newer mark has
        // been made on top of this one since.
        const back = () =>
            setMarks((all) => {
                if (all[b.id] !== outcome) return all;
                const next = { ...all };
                if (was) next[b.id] = was;
                else delete next[b.id];
                return next;
            });
        setMarks((all) => ({ ...all, [b.id]: outcome }));
        const first = firstName(whoFor(b));
        hold(
            key,
            outcome === "ATTENDED"
                ? `${first || "They"} ${BOOKING_WORDS.came.toLowerCase()}.`
                : `Marked ${first || "them"} as ${BOOKING_WORDS.didntCome.toLowerCase()}.`,
            async () => {
                try {
                    const res = await save(
                        (...org) => recordBookingOutcome(b.id, outcome, ...org),
                        { quiet: true },
                    );
                    if (!res) throw new Error(UNREACHED);
                    return res;
                } finally {
                    saved();
                }
            },
            back,
        );
    };

    const whenLine = (b: DiaryBooking) =>
        `${formatDateTime(b.startAt, timezone, { weekday: "short", relative: true, now })} · ${b.service.name}${b.staff ? ` with ${b.staff.name}` : ""}`;

    const renderRow = (b: DiaryBooking) => {
        const markKey = `outcome:${b.id}`;
        const markedNow = marks[b.id];
        const items = rowMenu(b, can, now);
        return (
            <BookingRow
                key={b.id}
                booking={b}
                zone={timezone}
                status={rowStatus(b, now)}
                asks={asksOutcome(b, now)}
                canMark={can.book}
                showMoney={can.money}
                marked={
                    markedNow
                        ? {
                              outcome: markedNow,
                              undo: pending.includes(markKey)
                                  ? () => undo(markKey)
                                  : null,
                          }
                        : null
                }
                onMark={(o) => mark(b, o)}
                onOpen={() => {
                    lastRow.current = b.id;
                    setPeekId(b.id);
                }}
                onUndo={() => undo(markKey)}
                when={whenLine(b)}
                heading={`${whoFor(b)} · ${formatDateTime(b.startAt, timezone, { relative: "lower", now })}`}
                triggerRef={(el) => {
                    if (el) triggers.current.set(b.id, el);
                    else triggers.current.delete(b.id);
                }}
                menu={{
                    actions: items,
                    takeLabel: takeLabel(b),
                    personLabel: personLabel(b),
                    openHref: `/bookings/${b.id}`,
                    personHref: b.contact ? personHref(b.contact.id) : null,
                    cancelling: pending.includes(`cancel-booking:${b.id}`),
                    onArrived: () => mark(b, "ATTENDED"),
                    onTake: () => {
                        lastRow.current = b.id;
                        setTaking(b);
                    },
                    onMove: () => {
                        lastRow.current = b.id;
                        setMoving(b);
                    },
                    onCancel: () => {
                        lastRow.current = b.id;
                        setCancelling(b);
                    },
                }}
            />
        );
    };

    if (!loading && bookings.length === 0 && !dates.date) {
        return (
            <EmptyState
                icon={<CalendarDays />}
                title="No bookings yet"
                description={EMPTY_LINE}
                action={share ? <ShareLinkButton link={share} /> : undefined}
            />
        );
    }

    const empty = emptyView(view, bookings.length);

    return (
        <div className="grid gap-3.5">
            <div className="grid gap-2.5">
                <div className="flex items-center gap-2 max-[759px]:flex-wrap">
                    <ShowingPicker
                        view={view}
                        counts={loading ? null : counts}
                        onChange={setView}
                    />
                    <SearchToggle
                        term={term}
                        fieldKey={searchKey}
                        onSearch={setTerm}
                    />
                    <BookingFilters
                        className="ml-auto max-[759px]:ml-0"
                        value={more}
                        onChange={setMore}
                        order={order}
                        onOrder={setOrderPick}
                        dates={dates}
                        onDates={pickDates}
                        today={today}
                        services={choices.services}
                        staff={choices.staff}
                        me={me}
                        showing={loading ? null : shown.length}
                        narrowedBy={narrowedBy}
                        viewLabel={viewLabel}
                        onClear={() => {
                            setMore(NO_MORE);
                            if (dates.date) pickDates(NO_DATE_RANGE);
                        }}
                    />
                </div>
                {searching || filtering ? (
                    <div
                        role="status"
                        className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground"
                    >
                        {searching ? (
                            <NarrowPill
                                onRemove={() => {
                                    setTerm("");
                                    setSearchKey((k) => k + 1);
                                }}
                            >
                                {`Search: ${term.trim()}`}
                            </NarrowPill>
                        ) : null}
                        {pills.map((pill) => (
                            <NarrowPill key={pill.key} onRemove={pill.remove}>
                                {pill.text}
                            </NarrowPill>
                        ))}
                        <Button
                            type="button"
                            variant="link"
                            size="inline"
                            onClick={clearAll}
                            className="max-[759px]:min-h-11"
                        >
                            Clear all
                        </Button>
                        <span aria-hidden>·</span>
                        {loading ? (
                            <FigureLoading />
                        ) : (
                            <span className="tabular-nums">
                                {shown.length} of {bookings.length} shown
                            </span>
                        )}
                    </div>
                ) : null}
            </div>

            {/* A date range is read for those days: the rows grey until it lands. */}
            <PendingRegion>
                {loading ? (
                    <PageLoading
                        bare
                        width="full"
                        shape="rows"
                        label="Loading bookings"
                    />
                ) : shown.length === 0 ? (
                    searching || filtering ? (
                        <EmptyState
                            kind="no-results"
                            things="bookings"
                            cause={filtering ? "filters" : "search"}
                            query={term}
                            onClear={clearAll}
                        />
                    ) : (
                        <EmptyState
                            kind="no-results"
                            things="bookings"
                            cause="view"
                            data-ph-unmask=""
                            title={empty.title}
                            description={empty.line}
                            onClear={() => setView("all")}
                        />
                    )
                ) : (
                    <>
                        {/* One card with day bands at a desk; on a phone each
                        day is its own card under its heading (BKMAllBookings). */}
                        <ListTable className="max-[759px]:grid max-[759px]:gap-4 max-[759px]:overflow-visible max-[759px]:rounded-none max-[759px]:border-0 max-[759px]:bg-transparent">
                            <ListTableHead
                                className={cn(
                                    ROW_GRID(can.money),
                                    "max-[759px]:hidden",
                                )}
                            >
                                <span>When · {zoneLabel}</span>
                                <span data-ph-unmask="">Customer</span>
                                <span data-ph-unmask="">Service · with</span>
                                {can.money ? (
                                    <span data-ph-unmask="">Money</span>
                                ) : null}
                                <span data-ph-unmask="">Status</span>
                                <span data-ph-unmask="" className="sr-only">
                                    Actions
                                </span>
                            </ListTableHead>
                            {groups.map((g) => (
                                <section
                                    key={g.key}
                                    aria-label={g.label}
                                    className="min-[760px]:border-b min-[760px]:border-border min-[760px]:last:border-b-0"
                                >
                                    <h2
                                        className={cn(
                                            listTable.group,
                                            "flex items-center gap-2 max-[759px]:border-0 max-[759px]:px-0 max-[759px]:pt-0",
                                        )}
                                    >
                                        {g.label}
                                        {g.rows.length === 0 &&
                                        g.key === today ? (
                                            <span
                                                data-ph-unmask=""
                                                className="text-[12.5px] font-normal normal-case tracking-normal text-muted-foreground"
                                            >
                                                · {NOBODY_ELSE_TODAY}
                                            </span>
                                        ) : null}
                                        {g.rows.length > 0 ? (
                                            <span className="ml-auto text-[12.5px] font-normal normal-case tracking-normal text-muted-foreground">
                                                {countedWords(
                                                    countItems(
                                                        listItems(g.rows),
                                                    ),
                                                )}
                                            </span>
                                        ) : null}
                                    </h2>
                                    <ul className="max-[759px]:overflow-hidden max-[759px]:rounded-[12px] max-[759px]:border max-[759px]:border-border max-[759px]:bg-card">
                                        {listItems(g.rows).map((item) =>
                                            item.kind === "one" ? (
                                                renderRow(item.booking)
                                            ) : (
                                                <ClassRow
                                                    key={item.key}
                                                    bookings={item.bookings}
                                                    zone={timezone}
                                                    showMoney={can.money}
                                                    now={now}
                                                >
                                                    {item.bookings.map(
                                                        renderRow,
                                                    )}
                                                </ClassRow>
                                            ),
                                        )}
                                        {g.cancelled?.length ? (
                                            <>
                                                {showCancelled ||
                                                unfolded.has(g.key)
                                                    ? g.cancelled.map(renderRow)
                                                    : null}
                                                <FoldLine
                                                    count={g.cancelled.length}
                                                    open={
                                                        showCancelled ||
                                                        unfolded.has(g.key)
                                                    }
                                                    onToggle={() =>
                                                        setUnfolded((all) => {
                                                            const next =
                                                                new Set(all);
                                                            if (
                                                                !next.delete(
                                                                    g.key,
                                                                )
                                                            )
                                                                next.add(g.key);
                                                            return next;
                                                        })
                                                    }
                                                />
                                            </>
                                        ) : null}
                                    </ul>
                                </section>
                            ))}
                        </ListTable>
                        {paging}
                    </>
                )}
            </PendingRegion>

            <CancelSheet
                open={cancelling !== null}
                booking={{
                    id: cancelling?.id ?? "",
                    who: cancelling ? whoFor(cancelling) : "",
                    when: cancelling ? whenLine(cancelling) : undefined,
                    freeCancelUntil: null,
                    timezone,
                }}
                canRefund={can.refund}
                canReadOrder={can.readOrder}
                send={send}
                returnFocusTo={backToRow}
                onClose={() => setCancelling(null)}
            />
            <MoveSheet
                booking={moving}
                timezone={timezone}
                returnFocusTo={backToRow}
                onClose={() => setMoving(null)}
            />
            <BookingQuickLook
                block={peekBooking ? blockOf(peekBooking, timezone) : null}
                onClose={() => setPeekId(null)}
                ctx={{
                    timezone,
                    now,
                    money: can.money,
                    rules,
                    canBook: can.book,
                    canRefund: can.refund,
                    reassign: {
                        any: can.assign ?? false,
                        me: me?.id ?? null,
                    },
                    canReadOrder: can.readOrder,
                    desk: {
                        canTake: can.take,
                        canLink: can.link,
                        online: can.online,
                    },
                    notices,
                }}
                act={act}
                heldFor={heldFor}
            />
            {taking?.take ? (
                <TakePayment
                    open
                    onOpenChange={(o) => {
                        if (!o) setTaking(null);
                    }}
                    bookingId={taking.id}
                    take={taking.take}
                    currency={taking.service.currency ?? null}
                    who={whoFor(taking)}
                    canLink={can.link}
                    online={can.online}
                />
            ) : null}
        </div>
    );
}

const NO_BOOKINGS: DiaryBooking[] = [];

/** A booking as the quick look takes it: a diary block on its own day. */
function blockOf(b: DiaryBooking, zone: string): Block {
    const start = localMinuteOf(b.startAt, zone);
    const length = Math.round(
        (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60_000,
    );
    return {
        kind: "one",
        key: b.id,
        start,
        end: start + length,
        state: bookingState(b),
        staffId: b.staff?.id ?? null,
        booking: b,
    };
}

/**
 * The register couldn't be read: said, with Try again, never "No bookings
 * yet" (an empty register would be a lie).
 */
export function BookingsCouldntLoad() {
    return (
        <FailedState
            title={couldntLoad("your bookings")}
            retryHref="/bookings/all"
        />
    );
}
