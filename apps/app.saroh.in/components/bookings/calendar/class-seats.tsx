"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type {
    ClassSession,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import { canCheckIn } from "@/lib/services/booking-state";
import {
    bookingState,
    clock,
    dayLabel,
    localDateOf,
    localMinuteOf,
    paidText,
    whoFor,
} from "@/lib/services/diary";

import { StatePill } from "./parts";
import type {
    HeldFor,
    QuickLookActions,
    QuickLookContext,
} from "./quick-look-types";

const HOUR = 3_600_000;

function prepaid(b: DiaryBooking): boolean {
    return b.paidWith === "PACK" || b.paidWith === "MEMBERSHIP";
}

/** A cancelled place in words: late or in time, and what happened to the class. */
function cancelledText(b: DiaryBooking): string {
    if (b.cancelledLate) {
        return prepaid(b)
            ? "Cancelled late — the class is used"
            : "Cancelled late";
    }
    return prepaid(b) ? "Cancelled — the class went back" : "Cancelled";
}

/**
 * "Booked by name": each place on a class, how it was paid, and the desk's
 * two moves — check in, cancel. Before the free-cancellation mark a pack or
 * membership class comes back; after it, it stays used (U3). The note above
 * the list says which side of the mark it is now.
 */
export function ClassSeats({
    session,
    ctx,
    act,
    heldFor,
}: {
    session: ClassSession;
    ctx: QuickLookContext;
    act: QuickLookActions;
    heldFor: HeldFor;
}) {
    if (session.bookings.length === 0) return null;
    const start = Date.parse(session.startAt);
    const rule = ctx.rules?.freeCancelHours ?? null;
    let note = "";
    if (rule !== null && ctx.now < start) {
        const mark = new Date(start - rule * HOUR);
        note =
            ctx.now < mark.getTime()
                ? `Classes come back if cancelled before ${dayLabel(localDateOf(mark, ctx.timezone)).split(" ")[0]} ${clock(localMinuteOf(mark, ctx.timezone))}`
                : `Past the ${rule}-hour mark — cancelling now uses the class`;
    }
    const seats = [...session.bookings].sort(
        (a, b) =>
            Number(a.status === "CANCELLED") -
                Number(b.status === "CANCELLED") ||
            whoFor(a).localeCompare(whoFor(b)),
    );

    return (
        <div className="rounded-[12px] border border-border bg-card px-4 py-[13px]">
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Booked by name
                </span>
                {note ? (
                    <span className="ml-auto text-[11.5px] text-muted-foreground">
                        {note}
                    </span>
                ) : null}
            </div>
            <ul>
                {seats.map((b) => {
                    const state = bookingState(b);
                    const undo = heldFor(b.id);
                    const cancelled = state === "cancelled";
                    const late = cancelled && b.cancelledLate;
                    const pill = cancelled
                        ? late
                            ? { label: "Late cancel", tone: "error" as const }
                            : prepaid(b)
                              ? {
                                    label: "Class back",
                                    tone: "neutral" as const,
                                }
                              : { label: "Cancelled", tone: "neutral" as const }
                        : null;
                    return (
                        <li
                            key={b.id}
                            className="flex flex-wrap items-center gap-2.5 border-t border-border/60 py-2"
                        >
                            <div className="min-w-0 flex-[1_1_150px]">
                                {b.contact ? (
                                    <Link
                                        href={`/customers/${b.contact.id}`}
                                        className="text-[13px] font-semibold text-foreground hover:text-brand"
                                    >
                                        {whoFor(b)}
                                    </Link>
                                ) : (
                                    <span className="text-[13px] font-semibold">
                                        {whoFor(b)}
                                    </span>
                                )}
                                <div
                                    className={cn(
                                        "mt-px text-[12px]",
                                        late
                                            ? "text-destructive-subtle-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {cancelled ? cancelledText(b) : paidText(b)}
                                </div>
                            </div>
                            {pill ? (
                                <StatePill
                                    label={pill.label}
                                    tone={pill.tone}
                                />
                            ) : (
                                <StatePill state={state} />
                            )}
                            {undo ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-[8px] text-[13px]"
                                    onClick={undo}
                                >
                                    Undo
                                </Button>
                            ) : ctx.canBook && state === "booked" ? (
                                <>
                                    {canCheckIn(b, ctx.now) ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="rounded-[8px] text-[13px]"
                                            onClick={() => act.checkIn(b)}
                                        >
                                            Check in
                                        </Button>
                                    ) : null}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-[8px] text-[13px] text-destructive hover:text-destructive"
                                        onClick={() => act.cancel(b)}
                                    >
                                        Cancel
                                    </Button>
                                </>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
