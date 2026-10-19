"use client";

import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListTable, listTable, ListTableHead } from "@saroh/ui/list-table";
import { ListFilter, ListToolbar } from "@saroh/ui/list-toolbar";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { ScrollX } from "@saroh/ui/scroll-x";
import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
    BookingRow,
    ROW_GRID,
} from "@/components/bookings/all-bookings/booking-row";
import { MoreBookingFilters } from "@/components/bookings/all-bookings/more-filters";
import { MoveSheet } from "@/components/bookings/all-bookings/move-sheet";
import { CancelSheet } from "@/components/bookings/sheets/cancel-sheet";
import { TakePayment } from "@/components/bookings/take-payment";
import { ChipGroup } from "@/components/shared/choice-group";
import { useHold } from "@/components/shared/use-hold";
import { ShareLinkButton } from "@/components/sites/share-link-button";
import { personHref } from "@/lib/contacts/person-href";
import { formatDateTime } from "@/lib/format/datetime";
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
    groupByDay,
    inView,
    matchesMore,
    matchesSearch,
    moreChoices,
    moreCount,
    NO_MORE,
    ordered,
    personLabel,
    readView,
    rowMenu,
    rowStatus,
    takeLabel,
    viewCounts,
    VIEWS,
} from "@/lib/services/all-bookings";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { BookingOutcome } from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import { whoFor } from "@/lib/services/diary";
import { zoneShortName } from "@/lib/services/time-picker";
import type { ShareLink } from "@/lib/sites/share-links";

/**
 * All bookings (U11; BKMAllBookings on a phone, BKDAllBookings at a desk):
 * the register behind the calendar, kept whole because its views answer
 * questions a diary does not — what's coming, what's waiting to be
 * marked, what's awaiting payment.
 *
 * - The views are chips with counts (Upcoming, Needs an outcome, Awaiting
 *   payment, Today, Next 7 days, All), after the search; More filters
 *   narrows by service, by who it is with and by status. `?view=` names
 *   the view, as Home's links do.
 * - Rows sit under day headings ("Today · Mon 19 Oct", "Earlier today"),
 *   every time in the business's zone, labelled ("When · IST", Q10).
 * - A booking that has ended unmarked asks "Did they come?" on its row:
 *   Came or Didn't come, held ten seconds with Undo.
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
    /** A payment link may be sent from Take ₹X. */
    link: boolean;
    /** The plan takes payment online. */
    online: boolean;
}

const EMPTY_LINE =
    "They show here when a customer books from your booking page, or when you add one.";

const ORDERS = [
    { value: "soonest", label: "Soonest first" },
    { value: "latest", label: "Latest first" },
] as const;

export function BookingsView({
    bookings,
    timezone,
    now,
    initialView,
    can,
    share = null,
}: {
    bookings: DiaryBooking[];
    /** The business's zone: every time is read in it (Q10). */
    timezone: string;
    /** The server's now, so the first render and the browser agree. */
    now: number;
    initialView?: string;
    can: AllBookingsCan;
    /**
     * A business with no bookings yet is offered "Share your booking page"
     * while the page is live (DEC-069, L8); null leaves it out.
     */
    share?: ShareLink | null;
}) {
    const router = useRouter();
    const [view, setViewState] = useState<ViewId>(() => readView(initialView));
    const [term, setTerm] = useState("");
    const [searchKey, setSearchKey] = useState(0);
    const [more, setMore] = useState<MoreFilters>(NO_MORE);
    const [orderPick, setOrderPick] = useState<Order | null>(null);
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
                (b) => matchesSearch(b, term) && matchesMore(b, more),
            ),
        [bookings, term, more],
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
    const choices = useMemo(() => moreChoices(bookings), [bookings]);
    const { rows: pageRows, paging } = useLocalPages("bookings", shown, {
        label: "Pages of bookings",
        resetOn: `${view}|${term}|${JSON.stringify(more)}|${order}`,
    });
    const groups = useMemo(
        () => groupByDay(pageRows, timezone, now),
        [pageRows, timezone, now],
    );

    const searching = term.trim() !== "";
    const filtering = moreCount(more) > 0;
    const clearAll = () => {
        setTerm("");
        setSearchKey((k) => k + 1);
        setMore(NO_MORE);
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
                    return await recordBookingOutcome(b.id, outcome);
                } finally {
                    router.refresh();
                }
            },
            back,
        );
    };

    const whenLine = (b: DiaryBooking) =>
        `${formatDateTime(b.startAt, timezone, { weekday: "short", relative: true, now })} · ${b.service.name}${b.staff ? ` with ${b.staff.name}` : ""}`;

    if (bookings.length === 0) {
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
            <ListToolbar
                search={
                    <ListSearch
                        key={searchKey}
                        placeholder="Search bookings"
                        describe="By name, phone or service"
                        onSearch={setTerm}
                    />
                }
                filters={
                    <ScrollX
                        bare
                        label="Show"
                        current='[aria-checked="true"]'
                        revealKey={view}
                        className="max-[759px]:-mx-4 max-[759px]:px-4 min-[760px]:overflow-visible"
                    >
                        <div className="flex items-center gap-1.5 max-[759px]:w-max min-[760px]:flex-wrap">
                            <ChipGroup
                                label="Show"
                                value={view}
                                onChange={setView}
                                className="flex-nowrap max-[759px]:w-max min-[760px]:flex-wrap"
                                choices={VIEWS.map((v) => ({
                                    value: v.id,
                                    label: (
                                        <>
                                            {v.label}
                                            {/* A real space: it is named "Upcoming 18". */}{" "}
                                            <span className="tabular-nums opacity-70">
                                                {counts[v.id]}
                                            </span>
                                        </>
                                    ),
                                }))}
                            />
                            <MoreBookingFilters
                                value={more}
                                onChange={setMore}
                                services={choices.services}
                                staff={choices.staff}
                                showing={shown.length}
                            />
                        </div>
                    </ScrollX>
                }
                onClear={searching || filtering ? clearAll : undefined}
                clearLabel={filtering ? "Clear filters" : "Clear search"}
                end={
                    <ListFilter
                        label="Order"
                        value={order}
                        onValueChange={(v) => setOrderPick(v)}
                        options={ORDERS}
                        narrowed={false}
                    />
                }
                count={
                    searching || filtering
                        ? `${narrowed.length} of ${bookings.length} bookings`
                        : undefined
                }
            />

            {shown.length === 0 ? (
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
                            className={`${ROW_GRID} max-[759px]:hidden`}
                        >
                            <span>When · {zoneLabel}</span>
                            <span>Customer</span>
                            <span>Service · with</span>
                            <span>Did they come?</span>
                            <span>Status</span>
                            <span className="sr-only">Actions</span>
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
                                        "max-[759px]:border-0 max-[759px]:px-0 max-[759px]:pt-0",
                                    )}
                                >
                                    {g.label}
                                </h2>
                                <ul className="max-[759px]:overflow-hidden max-[759px]:rounded-[12px] max-[759px]:border max-[759px]:border-border max-[759px]:bg-card">
                                    {g.rows.map((b) => {
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
                                                marked={
                                                    markedNow
                                                        ? {
                                                              outcome:
                                                                  markedNow,
                                                              undo: pending.includes(
                                                                  markKey,
                                                              )
                                                                  ? () =>
                                                                        undo(
                                                                            markKey,
                                                                        )
                                                                  : null,
                                                          }
                                                        : null
                                                }
                                                onMark={(o) => mark(b, o)}
                                                onUndo={() => undo(markKey)}
                                                when={whenLine(b)}
                                                heading={`${whoFor(b)} · ${formatDateTime(b.startAt, timezone, { relative: "lower", now })}`}
                                                triggerRef={(el) => {
                                                    if (el)
                                                        triggers.current.set(
                                                            b.id,
                                                            el,
                                                        );
                                                    else
                                                        triggers.current.delete(
                                                            b.id,
                                                        );
                                                }}
                                                menu={{
                                                    actions: items,
                                                    takeLabel: takeLabel(b),
                                                    personLabel: personLabel(b),
                                                    openHref: `/bookings/${b.id}`,
                                                    personHref: b.contact
                                                        ? personHref(
                                                              b.contact.id,
                                                          )
                                                        : null,
                                                    cancelling:
                                                        pending.includes(
                                                            `cancel-booking:${b.id}`,
                                                        ),
                                                    onArrived: () =>
                                                        mark(b, "ATTENDED"),
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
                                    })}
                                </ul>
                            </section>
                        ))}
                    </ListTable>
                    {paging}
                </>
            )}

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
