"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useHold } from "@/components/shared/use-hold";
import { formatClock } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import { firstName as firstNameOf } from "@/lib/names";
import { cancelBooking, recordBookingOutcome } from "@/lib/services/actions";
import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import { localMinuteOf, whoFor } from "@/lib/services/diary";
import { pastFreeCancel } from "@/lib/staff/free-cancel";
import type { BookingRules } from "@/lib/staff/types";
import { showError } from "@saroh/ui/toast";

import type { HeldFor, QuickLookActions } from "./quick-look-types";

/** What this screen shows changed before the server has it. */
export type Override = Partial<
    Pick<DiaryBooking, "status" | "outcome" | "cancelledLate">
>;

/** The calendar with this screen's held changes applied on top. */
export function withOverrides(
    calendar: BookingsCalendar,
    overrides: Record<string, Override>,
): BookingsCalendar {
    if (Object.keys(overrides).length === 0) return calendar;
    const apply = (b: DiaryBooking) => {
        const o = overrides[b.id] as Override | undefined;
        return o ? { ...b, ...o } : b;
    };
    return {
        ...calendar,
        diaries: calendar.diaries.map((d) => ({
            ...d,
            bookings: d.bookings.map(apply),
            classes: d.classes.map((s) => {
                const bookings = s.bookings.map(apply);
                return {
                    ...s,
                    bookings,
                    taken: bookings.filter((b) => b.status !== "CANCELLED")
                        .length,
                };
            }),
        })),
    };
}

/**
 * What the desk does on the calendar, each held ten seconds for its Undo
 * (`useHold`): Came, Didn't come, cancel a booking, cancel a class. Each
 * shows at once as an override on the read; a refusal or a failure to
 * reach the server takes back only its own override, never a newer mark
 * made on top of it.
 */
export function useCalendarActions({
    now,
    timezone,
    money,
    rules,
}: {
    now: number;
    timezone: string;
    /** The viewer reads money: the Came toast can say what to take. */
    money: boolean;
    /** The business's: its free-cancel window is everyone's (DEC-170). */
    rules: BookingRules | null;
}) {
    const router = useRouter();
    const { hold, undo, pending } = useHold();
    const [overrides, setOverrides] = useState<Record<string, Override>>({});

    /**
     * Show `o` on booking `id`; the answer takes back exactly this change,
     * and only while it is still the one shown.
     */
    const show = (id: string, o: Override) => {
        const was = overrides[id] as Override | undefined;
        setOverrides((all) => ({ ...all, [id]: o }));
        return () =>
            setOverrides((all) => {
                if (all[id] !== o) return all;
                const next = { ...all };
                if (was) next[id] = was;
                else delete next[id];
                return next;
            });
    };

    /** The write, then a fresh read whatever happened. */
    const andRefresh =
        <T>(write: () => Promise<T>) =>
        async () => {
            try {
                return await write();
            } finally {
                router.refresh();
            }
        };

    const firstName = (b: DiaryBooking) => firstNameOf(whoFor(b));
    const isClassSeat = (b: DiaryBooking) => b.service.capacity > 1;

    const act: QuickLookActions = {
        checkIn(b) {
            const back = show(b.id, { outcome: "ATTENDED" });
            // What is still to take, never the full price of one paid.
            const take =
                money && b.take?.cents
                    ? formatMoney(b.take.cents, b.service.currency ?? null)
                    : null;
            hold(
                `outcome:${b.id}`,
                `${firstName(b)} ${BOOKING_WORDS.came.toLowerCase()}.${take ? ` Take ${take} now.` : ""}`,
                andRefresh(() => recordBookingOutcome(b.id, "ATTENDED")),
                back,
            );
        },
        noShow(b) {
            const back = show(b.id, { outcome: "NO_SHOW" });
            hold(
                `outcome:${b.id}`,
                `Marked ${firstName(b)} as ${BOOKING_WORDS.didntCome.toLowerCase()}.`,
                andRefresh(() => recordBookingOutcome(b.id, "NO_SHOW")),
                back,
            );
        },
        cancel(b) {
            const hours = rules?.freeCancelHours ?? null;
            const late = pastFreeCancel(hours, b.startAt, now);
            const prepaid =
                b.paidWith === "PACK" || b.paidWith === "MEMBERSHIP";
            const back = show(b.id, {
                status: "CANCELLED",
                cancelledLate: late,
            });
            const who = firstName(b);
            const message = isClassSeat(b)
                ? prepaid
                    ? late
                        ? `${who}'s place cancelled. Within ${hours} hours, so the class is used.`
                        : `${who}'s place cancelled. The class goes back to the ${b.paidWith === "PACK" ? "pack" : "membership"}.`
                    : `${who}'s place cancelled.`
                : `Cancelled ${who}'s ${formatClock(localMinuteOf(b.startAt, timezone))}.`;
            hold(
                `cancel:${b.id}`,
                message,
                andRefresh(() => cancelBooking(b.id)),
                back,
            );
        },
        cancelClass(seats, title, reason) {
            const backs = new Map(
                seats.map((b) => [
                    b.id,
                    show(b.id, { status: "CANCELLED", cancelledLate: false }),
                ]),
            );
            const backAll = () => {
                backs.forEach((back) => back());
            };
            const given = seats.filter(
                (b) => b.paidWith === "PACK" || b.paidWith === "MEMBERSHIP",
            ).length;
            hold(
                `class:${seats.map((b) => b.id).join(",")}`,
                `${title} cancelled.${given ? ` ${count(given, "class", "classes")} given back.` : ""}`,
                andRefresh(async () => {
                    // Each place on its own: one that fails is put back
                    // and counted, the rest stay cancelled.
                    let failed = 0;
                    for (const b of seats) {
                        let ok: boolean;
                        try {
                            const res = await cancelBooking(b.id, {
                                returnCredit: true,
                                closesClass: true,
                                reason,
                            });
                            ok = res.ok;
                        } catch {
                            ok = false;
                        }
                        if (!ok) {
                            failed += 1;
                            backs.get(b.id)?.();
                        }
                    }
                    if (failed) {
                        showError(
                            `${count(failed, "place")} couldn't be cancelled.`,
                            "The rest are. Open the class to try those again.",
                        );
                    }
                }),
                backAll,
            );
        },
    };

    /** Undo for a booking whose change is still held, or null. */
    const heldFor: HeldFor = (id) => {
        const key = pending.find(
            (k) =>
                k === `outcome:${id}` ||
                k === `cancel:${id}` ||
                (k.startsWith("class:") && k.slice(6).split(",").includes(id)),
        );
        return key ? () => undo(key) : null;
    };

    return { overrides, act, heldFor };
}
