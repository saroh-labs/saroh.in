"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Check, CircleCheck, CircleX, IndianRupee } from "lucide-react";
import type { ReactNode } from "react";

import { FRONT_DESK_LINE } from "@/components/bookings/quick-look/quick-look-one";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/components/shared/states/who-can-change";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import {
    classCancelReason,
    isClassCancel,
    namesWho,
    systemEventTitle,
} from "@/lib/services/booking-history";
import type { MoneyRow } from "@/lib/services/booking-page-money";
import type { BookingOutcome } from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { BookingEvent } from "@/lib/services/service";

/**
 * The cards of a booking's page (U12; BKMBookingDetail, BKDBooking): "Did
 * Kabir come?", Money, What happened and Customer. One card look at both
 * sizes; a phone heads each with a small label, a desk with a title.
 */

export const CARD =
    "min-w-0 rounded-xl border border-border bg-card px-3.5 py-1 min-[760px]:px-[18px] min-[760px]:py-4";

/** "CUSTOMER" on a phone, "Customer" as a card title at a desk. */
export function CardTitle({
    id,
    children,
}: {
    id: string;
    children: ReactNode;
}) {
    return (
        <h2
            id={id}
            data-ph-unmask=""
            className="label block pb-0.5 pt-2.5 min-[760px]:mb-1.5 min-[760px]:p-0 min-[760px]:font-display min-[760px]:text-[16px] min-[760px]:normal-case min-[760px]:tracking-[-0.02em] min-[760px]:text-foreground"
        >
            {children}
        </h2>
    );
}

/** A row of what is known: an icon on a phone, a word at a desk. */
export function Row({
    icon,
    label,
    children,
    aside,
    className,
}: {
    icon: ReactNode;
    label: string;
    children: ReactNode;
    aside?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex min-h-12 items-center gap-3 border-b border-border/70 text-[14px] last:border-b-0 min-[760px]:min-h-0 min-[760px]:py-2.5 min-[760px]:text-[13.5px]",
                className,
            )}
        >
            <span className="flex w-[22px] shrink-0 text-muted-foreground min-[760px]:hidden">
                {icon}
            </span>
            <span className="hidden w-[150px] shrink-0 text-muted-foreground min-[760px]:inline">
                {label}
            </span>
            <span className="sr-only min-[760px]:hidden">{label}: </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {children}
            </span>
            {aside}
        </div>
    );
}

/**
 * "Did Kabir come?" with Came and Didn't come, big on a phone and a row
 * at a desk. Marked, it says so and keeps both, so a wrong press is one
 * press to put right; a mark still held has its Undo beside it.
 */
export function OutcomeCard({
    first,
    outcome,
    line,
    canDidnt,
    asking,
    onMark,
    onUndo,
}: {
    first: string;
    outcome: BookingOutcome | null;
    line: string;
    /** Didn't come waits for the start (the API's rule). */
    canDidnt: boolean;
    /** Ended and nobody has said: drawn with an Ink edge. */
    asking: boolean;
    onMark: (outcome: BookingOutcome) => void;
    /** Undo for a mark still held, or null. */
    onUndo: (() => void) | null;
}) {
    const big =
        "h-[72px] flex-1 flex-col gap-1 rounded-xl text-[14px] min-[760px]:h-[38px] min-[760px]:flex-none min-[760px]:flex-row min-[760px]:gap-2 min-[760px]:rounded-lg";
    return (
        <section
            aria-labelledby="outcome-title"
            className={cn(
                "min-w-0 rounded-xl border bg-card p-3.5 min-[760px]:flex min-[760px]:items-center min-[760px]:gap-4 min-[760px]:px-[18px] min-[760px]:py-4",
                asking ? "border-foreground" : "border-border",
            )}
        >
            <div className="min-w-0 min-[760px]:flex-1">
                <h2
                    id="outcome-title"
                    data-ph-mask=""
                    className="text-[15px] font-semibold"
                >
                    {first ? `Did ${first} come?` : "Did they come?"}
                </h2>
                <p
                    aria-live="polite"
                    data-ph-unmask=""
                    className="mt-0.5 text-[12.5px] leading-[1.5] text-muted-foreground"
                >
                    {line}
                </p>
            </div>
            <div className="mt-2.5 flex gap-2 min-[760px]:mt-0">
                <Button
                    type="button"
                    variant={outcome === "ATTENDED" ? "default" : "outline"}
                    aria-pressed={outcome === "ATTENDED"}
                    className={cn(
                        big,
                        outcome !== "ATTENDED" &&
                            "text-success-subtle-foreground",
                    )}
                    onClick={() => onMark("ATTENDED")}
                >
                    <CircleCheck
                        aria-hidden
                        className="size-[22px] min-[760px]:size-4"
                    />
                    {BOOKING_WORDS.came}
                </Button>
                {canDidnt ? (
                    <Button
                        type="button"
                        variant={outcome === "NO_SHOW" ? "default" : "outline"}
                        aria-pressed={outcome === "NO_SHOW"}
                        className={cn(
                            big,
                            outcome !== "NO_SHOW" &&
                                "text-destructive-subtle-foreground",
                        )}
                        onClick={() => onMark("NO_SHOW")}
                    >
                        <CircleX
                            aria-hidden
                            className="size-[22px] min-[760px]:size-4"
                        />
                        {BOOKING_WORDS.didntCome}
                    </Button>
                ) : null}
                {onUndo ? (
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-[72px] min-[760px]:h-[38px]"
                        onClick={onUndo}
                    >
                        Undo
                    </Button>
                ) : null}
            </div>
        </section>
    );
}

/**
 * Money (BKMBookingDetail, BKDBooking): the price, what was paid and
 * how, what is still to take, and under them the business's policy and
 * any refund in its full words.
 */
export function MoneyCard({
    rows,
    lines,
    children,
}: {
    rows: MoneyRow[];
    /** The policy, the free-cancel time, a refund's full story. */
    lines: { text: string; bad?: boolean }[];
    /** A class pack paying for it, or a treatment's order. */
    children?: ReactNode;
}) {
    if (rows.length === 0 && lines.length === 0 && !children) return null;
    return (
        <section aria-labelledby="money-title" className={CARD}>
            <CardTitle id="money-title">Money</CardTitle>
            {rows.length > 0 ? (
                <div data-ph-mask="">
                    {rows.map((r) => (
                        <Row
                            key={r.key}
                            label={r.label}
                            icon={
                                r.key === "left" ? (
                                    <IndianRupee
                                        aria-hidden
                                        className="size-[18px]"
                                    />
                                ) : (
                                    <Check
                                        aria-hidden
                                        className="size-[18px]"
                                    />
                                )
                            }
                        >
                            <span
                                className={cn(
                                    "tabular-nums",
                                    r.strong && "min-[760px]:font-semibold",
                                    r.bad && "text-destructive",
                                )}
                            >
                                {r.text}
                            </span>
                        </Row>
                    ))}
                </div>
            ) : null}
            {lines.map((l) => (
                <p
                    key={l.text}
                    className={cn(
                        "pb-2.5 pt-1.5 text-[12.5px] leading-[1.5] min-[760px]:pb-0",
                        l.bad ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {l.text}
                </p>
            ))}
            {children ? (
                <div className="pb-3 pt-1 min-[760px]:pb-0">{children}</div>
            ) : null}
        </section>
    );
}

/**
 * The one line under "Did Kabir come?" that says what this person can't
 * do here (one message at a time): read-only for a role without
 * `booking:write`, the front desk's for someone who can't take payment
 * (the locked Take points at it), or why an archived service's booking
 * can't be moved.
 */
export function PageNote({
    kind,
    id,
    service,
}: {
    kind: "read-only" | "front-desk" | "retired";
    id?: string;
    service?: string;
}) {
    if (kind === "read-only") {
        return (
            <ReadOnlyNote id={id} className="my-0">
                {readOnlyLine("this booking")}
            </ReadOnlyNote>
        );
    }
    return (
        <p
            id={id}
            data-ph-unmask={kind === "front-desk" ? "" : undefined}
            className="text-[12.5px] leading-[1.5] text-muted-foreground"
        >
            {kind === "front-desk"
                ? FRONT_DESK_LINE
                : `${service ?? "This service"} is archived, so this booking cannot be moved. Make the service active again to move it, or cancel the booking.`}
        </p>
    );
}

/** One line of What happened, in words rather than a state name. */
export function eventTitle(event: BookingEvent, timeZone: string): string {
    if (event.type === "BOOKED") return "Booked";
    if (event.type === "CANCELLED") {
        return isClassCancel(event) ? "Class cancelled" : "Cancelled";
    }
    if (event.type === "ATTENDED") return "Marked as came";
    if (event.type === "NO_SHOW") return "Marked as didn't come";
    if (event.type === "PAID_AT_DESK") return "Paid at the desk";
    if (event.type === "REASSIGNED") return reassignedTitle(event, timeZone);
    const system = systemEventTitle(event);
    if (system) return system;
    const from = event.fromStartAt
        ? formatDateTime(event.fromStartAt, timeZone, { weekday: "short" })
        : null;
    const to = event.toStartAt
        ? formatDateTime(event.toStartAt, timeZone, { weekday: "short" })
        : null;
    return from && to ? `Moved from ${from} to ${to}` : "Moved";
}

/**
 * A change of who it is with (#1157): "Given to Meera Iyer" when it had
 * nobody, "Changed from Asha Rao to Meera Iyer" otherwise, with the time
 * when it moved in the same step.
 */
function reassignedTitle(event: BookingEvent, timeZone: string): string {
    const to = event.toStaff?.name ?? "someone";
    const who = event.fromStaff
        ? `Changed from ${event.fromStaff.name} to ${to}`
        : event.fromStaff === null && event.toStaff
          ? `Given to ${to}`
          : `Now with ${to}`;
    const moved =
        event.fromStartAt &&
        event.toStartAt &&
        event.fromStartAt !== event.toStartAt;
    return moved && event.toStartAt
        ? `${who}, moved to ${formatDateTime(event.toStartAt, timeZone, { weekday: "short" })}`
        : who;
}

/** What happened: the booking's history, oldest first. */
export function HistoryCard({
    events,
    timezone,
}: {
    events: BookingEvent[];
    timezone: string;
}) {
    return (
        <section aria-labelledby="history-title" className={CARD}>
            <CardTitle id="history-title">What happened</CardTitle>
            <ol className="pb-1 min-[760px]:pb-0">
                {events.map((event) => (
                    <li
                        key={event.id}
                        className="flex items-start gap-3 border-b border-border/70 py-2.5 text-[14px] last:border-b-0 min-[760px]:items-baseline min-[760px]:text-[13.5px]"
                    >
                        <span
                            aria-hidden
                            className="mt-[7px] flex w-[22px] shrink-0 justify-center min-[760px]:hidden"
                        >
                            <span className="size-2 rounded-full bg-border-strong" />
                        </span>
                        <span className="min-w-0 flex-1 min-[760px]:flex min-[760px]:items-baseline min-[760px]:gap-3">
                            <span className="block min-w-0 min-[760px]:flex-1">
                                <span className="block font-medium min-[760px]:font-normal">
                                    {eventTitle(event, timezone)}
                                </span>
                                {/* The reason the class was cancelled with
                                    (DEC-178), as the business typed it. */}
                                {classCancelReason(event) ? (
                                    <span
                                        data-ph-mask=""
                                        className="mt-0.5 block break-words text-[13px] text-muted-foreground"
                                    >
                                        Reason: {classCancelReason(event)}
                                    </span>
                                ) : null}
                            </span>
                            <span
                                data-ph-mask=""
                                className="block text-[12px] text-muted-foreground min-[760px]:text-[12.5px]"
                            >
                                {formatDate(event.createdAt, timezone, {
                                    weekday: "short",
                                })}
                                {/* Null actor: the booker did it, on the
                                    booking page — unless nobody did (a
                                    lapse, a refund, #1137). */}
                                {!namesWho(event)
                                    ? null
                                    : event.actor?.name
                                      ? ` · ${event.actor.name}`
                                      : " · by the customer"}
                            </span>
                        </span>
                    </li>
                ))}
                {events.length === 0 ? (
                    <li className="py-2.5 text-[13.5px] text-muted-foreground">
                        This booking predates the history log, so only its
                        current state is known.
                    </li>
                ) : null}
            </ol>
        </section>
    );
}
