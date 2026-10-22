"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import type { CSSProperties, ReactElement } from "react";
import { useId, useState } from "react";

import { BookingPackControl } from "@/components/bookings/booking-pack-control";
import {
    HistoryCard,
    MoneyCard,
    OutcomeCard,
    PageNote,
} from "@/components/bookings/booking-page/cards";
import { CustomerCard } from "@/components/bookings/booking-page/customer-card";
import { PageHead } from "@/components/bookings/booking-page/head";
import { MainButton } from "@/components/bookings/booking-page/main-action";
import type { PageSheet } from "@/components/bookings/booking-page/overlays";
import { PageOverlays } from "@/components/bookings/booking-page/overlays";
import { useOutcomeMark } from "@/components/bookings/booking-page/use-outcome-mark";
import type { MoreRow } from "@/components/bookings/calendar/quick-look-more";
import { ClassWaitlist } from "@/components/bookings/class-waitlist";
import { JoinOnline } from "@/components/bookings/join-online";
import { useNewBookingLauncher } from "@/components/bookings/new-booking/launcher";
import type { ReassignScope } from "@/components/bookings/sheets/change-who";
import { mayChangeWho, onlyTo } from "@/components/bookings/sheets/change-who";
import { TreatmentVisits } from "@/components/bookings/treatment-visits";
import { PageContainer } from "@/components/shared/page/page-container";
import { useHold } from "@/components/shared/undo/use-hold";
import { personHref } from "@/lib/contacts/person-href";
import { formatMoney } from "@/lib/format/money";
import { firstName } from "@/lib/names";
import type { PageBooking, PageFacts } from "@/lib/services/booking-page";
import {
    bookerLabel,
    bookerPick,
    outcomeAsk,
    outcomeLine,
    pageBadge,
    pageCanCancel,
    pageCanMove,
    pageCanReassign,
    pageHeading,
    pageMain,
    pageMoreItems,
    pageOrigin,
    pageWhat,
} from "@/lib/services/booking-page";
import { moneyNotes, moneyRows } from "@/lib/services/booking-page-money";
import type { ClassWaitlistRow } from "@/lib/services/class-waitlist-words";
import { localDateOf } from "@/lib/services/diary";
import { joinLink } from "@/lib/services/meeting-link";
import type { PeekPerson } from "@/lib/services/peek";
import { zoneShortName } from "@/lib/services/time-picker";

/**
 * A booking's page (U12, #1028; BKMBookingDetail, BKDBooking), one
 * component for a phone and a desk. The day and time are the heading, in
 * the business's zone (Q10). One main action is pinned (the foot of a
 * phone, the top right of a desk): Take ₹X (locked, saying why once, for
 * a role that can't take it), then Book their next visit, Book them
 * again, or Book a new time once cancelled. Move sits beside it; More
 * holds the rest, Cancel last in red. "Did Kabir come?" waits ten seconds
 * with Undo. Nothing the page offered before is gone: money, policy and
 * refund, class pack, a treatment's visits, a class's waitlist, Join
 * online, the archived and read-only notes, and the history.
 */
export function BookingDetailView({
    booking,
    past,
    now: nowProp,
    timezone: zone,
    packs,
    canWrite = false,
    canRefund = false,
    canReadOrder = false,
    desk,
    waitlist,
    person = null,
    reassign,
}: {
    booking: PageBooking;
    /** Whether the slot has ended. Read by the page so "now" stays out of render. */
    past: boolean;
    /** The page's clock, for when Came and Didn't come open. */
    now?: number;
    /** The business's zone (Q10); the service's when left out. */
    timezone?: string;
    /**
     * `booking:write`: may mark, move, cancel and book. Without it none is
     * drawn and the page says it is read-only. A calendar-only person
     * holds it for the bookings the API sends them (their own).
     */
    canWrite?: boolean;
    /** `payment:manage`: may change what the policy does with the money. */
    canRefund?: boolean;
    /** `order:read`: a treatment's visit links to its order (E9). */
    canReadOrder?: boolean;
    /**
     * Taking payment at the desk (P2): `booking:write` and `invoice:write`,
     * and whether a payment link can be sent (a provider connected).
     */
    desk?: {
        canTake: boolean;
        canLink: boolean;
        /** The plan takes payment online (R33); else no link is offered. */
        online?: boolean;
    };
    /** Class packs (ADR-007), read by the page. */
    packs?: {
        paidWith: { name: string } | null;
        usable: { id: string; label: string }[];
        canWrite: boolean;
    };
    /** A class's waitlist for this session (A12); null: the read failed. */
    waitlist?: ClassWaitlistRow[] | null;
    /** Their phone, Needs attention and how a change reaches them. */
    person?: PeekPerson | null;
    /**
     * Who the viewer may give bookings to (#1157); left out, anyone's to
     * anyone (the API still decides).
     */
    reassign?: ReassignScope;
}) {
    const launcher = useNewBookingLauncher();
    const ids = { frontDesk: useId() };
    const { service, contact } = booking;
    const timezone = zone ?? (service.timezone || booking.timezone);
    // Without the page's clock: as if just after it ended, or well before.
    const now =
        nowProp ??
        (past
            ? Date.parse(booking.endAt) + 1
            : Date.parse(booking.startAt) - 2 * 3_600_000);
    const who = bookerLabel(booking);
    const first = firstName(who);

    // Came / Didn't come show at once and wait ten seconds with Undo; a
    // plain cancel waits too (it tells the customer), and reads as done.
    const { hold, send, undo, pending } = useHold();
    const { outcome, markedHere, markOutcome, undoMark } = useOutcomeMark({
        bookingId: booking.id,
        saved: booking.outcome,
        first,
        hold,
        undo,
        pending,
    });
    const [open, setOpen] = useState<PageSheet>(null);
    const status = pending.includes(`cancel-booking:${booking.id}`)
        ? "CANCELLED"
        : booking.status;
    const cancelled = status === "CANCELLED";

    const money = booking.money;
    const format = (cents: number) =>
        formatMoney(cents, money?.currency ?? service.currency);
    const take = money?.take && !cancelled ? money.take : null;
    const facts: PageFacts = {
        status,
        outcome,
        canBook: canWrite,
        canLaunch: launcher !== null && bookerPick(booking) !== null,
        bookedElsewhere: service.capacity > 1 || Boolean(booking.treatment),
        take,
        canTake: desk ? desk.canTake : null,
        ended: past,
        retired: service.status !== "ACTIVE",
        oneToOne:
            service.capacity <= 1 &&
            mayChangeWho(reassign, booking.staff?.id ?? null),
    };
    const main = pageMain(facts);
    const canMove = pageCanMove(facts);
    const ask = outcomeAsk(booking, outcome, canWrite, now);
    const frontDesk = canWrite && desk !== undefined && !desk.canTake;
    const heading = pageHeading(booking, timezone, now);
    const link = joinLink(booking);
    const markedBy =
        booking.events.findLast(
            (e) => e.type === "ATTENDED" || e.type === "NO_SHOW",
        )?.actor?.name ?? null;

    // Book their next visit, Book them again and Book a new time (U8):
    // who, what and with whom filled; the day the merchant's (Q16).
    const book = (nextVisit: boolean) =>
        launcher?.open({
            who: bookerPick(booking),
            serviceId: service.id,
            staffId: booking.staff?.id ?? null,
            nextVisit,
        });

    const moreRows: MoreRow[] = pageMoreItems(facts, {
        first,
        hasPerson: contact !== null,
        hasStaff: Boolean(booking.staff),
    }).map((item) => ({
        key: item.action,
        label: item.label,
        icon: item.action,
        danger: item.danger,
        ...(item.action === "day"
            ? {
                  href: `/bookings?date=${localDateOf(booking.startAt, timezone)}`,
              }
            : item.action === "person" && contact
              ? { href: personHref(contact.id) }
              : {
                    onSelect: () =>
                        item.action === "next"
                            ? book(true)
                            : setOpen(
                                  item.action === "move" ||
                                      item.action === "who"
                                      ? item.action
                                      : "cancel",
                              ),
                }),
    }));

    const mainButton = main ? (
        <MainButton
            main={main}
            amount={take ? format(take.cents) : null}
            first={first}
            frontDeskId={ids.frontDesk}
            onTake={() => setOpen("take")}
            onBook={() => book(main !== "rebook")}
        />
    ) : null;
    const moveButton = canMove ? (
        <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 text-[15px] min-[760px]:h-11 min-[760px]:flex-none min-[760px]:text-[14.5px]"
            onClick={() => setOpen("move")}
        >
            Move
        </Button>
    ) : null;

    const pack =
        packs !== undefined &&
        (packs.paidWith !== null ||
            (packs.canWrite && packs.usable.length > 0)) ? (
            <BookingPackControl
                bookingId={booking.id}
                paidWith={packs.paidWith}
                usable={packs.usable}
                canWrite={packs.canWrite}
            />
        ) : null;

    // The main column; Customer sits beside it at a desk, and after "Did
    // Kabir come?" and its line on a phone.
    const before: ReactElement[] = [];
    const after: ReactElement[] = [];
    if (ask) {
        before.push(
            <OutcomeCard
                key="outcome"
                first={first}
                outcome={outcome}
                line={outcomeLine(outcome, markedHere ? null : markedBy)}
                canDidnt={ask.didnt}
                asking={past && outcome === null}
                onMark={markOutcome}
                onUndo={undoMark}
            />,
        );
    }
    const note = !canWrite ? "read-only" : frontDesk ? "front-desk" : null;
    if (note) {
        before.push(<PageNote key={note} id={ids.frontDesk} kind={note} />);
    }
    if (pageCanReassign(facts) && !booking.staff) {
        // Nobody on it (#1157): say so where it's seen, with the way out.
        before.push(
            <Notice
                key="nobody"
                tone="info"
                role="note"
                className="flex flex-wrap items-center gap-x-3 gap-y-2"
            >
                <span className="min-w-0 flex-1">
                    Nobody is on this booking yet.
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen("who")}
                >
                    Assign someone
                </Button>
            </Notice>,
        );
    }
    if (facts.retired && !cancelled && !past && canWrite) {
        // A missing Move with no explanation reads as a bug.
        before.push(
            <PageNote key="retired" kind="retired" service={service.name} />,
        );
    }
    if (money || pack) {
        after.push(
            <MoneyCard
                key="money"
                rows={money ? moneyRows(money, format, cancelled) : []}
                lines={
                    money
                        ? moneyNotes(money, {
                              format,
                              cancelled,
                              ended: past,
                              freeCancelUntil: booking.freeCancelUntil,
                              timezone,
                          })
                        : []
                }
            >
                {pack}
            </MoneyCard>,
        );
    }
    if (booking.treatment) {
        after.push(
            <TreatmentVisits
                key="treatment"
                treatment={booking.treatment}
                service={service}
                who={who}
                canReadOrder={canReadOrder}
            />,
        );
    }
    if (waitlist !== undefined) {
        after.push(
            <ClassWaitlist
                key="waitlist"
                rows={waitlist}
                timezone={timezone}
            />,
        );
    }
    after.push(
        <HistoryCard
            key="history"
            events={booking.events}
            timezone={timezone}
        />,
    );
    const inColumn = (el: ReactElement) => (
        <div key={el.key} className="min-w-0 min-[760px]:col-start-1">
            {el}
        </div>
    );

    return (
        <PageContainer
            width="default"
            className={cn(main || moveButton ? "max-[759px]:pb-24" : "")}
        >
            <PageHead
                badge={pageBadge({ status, outcome, ended: past })}
                origin={pageOrigin(booking.events)}
                day={heading.day}
                time={heading.time}
                who={who}
                what={`${pageWhat(booking)} · times in ${zoneShortName(timezone, now) || timezone}`}
                more={{
                    title: first ? `${first}'s booking` : "This booking",
                    rows: moreRows,
                }}
                actions={
                    <>
                        {mainButton}
                        {moveButton}
                    </>
                }
            />
            {link ? <JoinOnline url={link} /> : null}

            <div className="mt-3.5 grid gap-3 min-[760px]:mt-0 min-[760px]:grid-cols-[minmax(0,1fr)_360px] min-[760px]:items-start min-[760px]:gap-x-[18px] min-[760px]:gap-y-3.5">
                {before.map(inColumn)}
                <CustomerCard
                    who={who}
                    contactId={contact?.id ?? null}
                    phone={
                        [booking.bookerPhone, contact?.phone, person?.phone]
                            .map((p) => p?.trim())
                            .find(Boolean) ?? null
                    }
                    email={contact?.email ?? booking.bookerEmail ?? null}
                    person={person}
                    note={booking.intakeNote?.trim() ?? null}
                    className="min-[760px]:col-start-2 min-[760px]:[grid-row:1/span_var(--column-rows)]"
                    style={
                        {
                            "--column-rows": before.length + after.length,
                        } as CSSProperties
                    }
                />
                {after.map(inColumn)}
            </div>

            {/* Pinned at the foot of a phone, above the tab bar. */}
            {mainButton || moveButton ? (
                <div
                    data-pinned=""
                    className="fixed inset-x-0 bottom-[var(--tab-bar-inset,0px)] z-30 flex gap-2 border-t border-border bg-card px-4 pb-3 pt-2.5 min-[760px]:hidden print:hidden"
                >
                    {mainButton ? (
                        <span className="flex flex-[2] [&>*]:w-full">
                            {mainButton}
                        </span>
                    ) : null}
                    {moveButton}
                </div>
            ) : null}

            <PageOverlays
                open={open}
                onOpen={setOpen}
                booking={booking}
                who={who}
                timezone={timezone}
                now={nowProp}
                canMove={canMove}
                canReassign={pageCanReassign(facts)}
                reassignOnly={onlyTo(reassign, booking.staff?.id ?? null)}
                canCancel={pageCanCancel(facts)}
                canRefund={canRefund}
                canReadOrder={canReadOrder}
                take={take && desk?.canTake ? take : null}
                desk={desk}
                person={person}
                send={send}
            />
        </PageContainer>
    );
}
