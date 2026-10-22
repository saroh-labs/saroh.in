"use client";

import { Notice } from "@saroh/ui/notice";
import { showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
    changeToldText,
    isTakenRefusal,
    movedToldText,
} from "@/components/bookings/calendar/quick-look-state";
import { TimePicker } from "@/components/bookings/sheets/time-picker";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/forms/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { formatDateTime, formatTime } from "@/lib/format/datetime";
import type { NoticeReach } from "@/lib/messages/notice-reach";
import { firstName } from "@/lib/names";
import { rescheduleBooking } from "@/lib/services/actions";
import { deadlineText } from "@/lib/services/booking-money";
import { localDateOf } from "@/lib/services/diary";

/** The booking being moved, as the page knows it. */
export interface MoveTarget {
    id: string;
    serviceId: string;
    serviceName: string;
    startAt: string;
    who: string;
    staff: { id: string; name: string } | null;
    freeCancelUntil: string | null;
}

/**
 * "Move Kabir's booking" from a booking's page (U12; BKMQuickLookStep2's
 * Move, BKDQuickLook's): U3's one time picker with the same person, a
 * bottom sheet on a phone and the right-hand panel at a desk. Pick a date
 * looks further ahead. A time taken meanwhile is said in the picker,
 * which reads the times again; any other refusal is said in the sheet and
 * nothing changes. Moved, the toast says so with Undo.
 */
export function MoveSheet({
    open,
    booking,
    timezone,
    reach,
    now,
    onClose,
}: {
    open: boolean;
    booking: MoveTarget;
    /** The business's zone (Q10). */
    timezone: string;
    /** How a change reaches them (A14); null when unknown. */
    reach: NoticeReach | null;
    now?: number;
    onClose: () => void;
}) {
    const first = firstName(booking.who);
    return (
        <FormSheet
            open={open}
            bottomOnPhone
            wide
            title={first ? `Move ${first}'s booking` : "Move this booking"}
            description={`${booking.serviceName}, now ${formatDateTime(booking.startAt, timezone, { weekday: "short", relative: "lower", now })}. ${changeToldText(reach, first)}`}
            onClose={onClose}
        >
            {open ? (
                <MoveDraft
                    booking={booking}
                    timezone={timezone}
                    reach={reach}
                    now={now}
                    onClose={onClose}
                />
            ) : null}
        </FormSheet>
    );
}

function MoveDraft({
    booking,
    timezone,
    reach,
    now,
    onClose,
}: {
    booking: MoveTarget;
    timezone: string;
    reach: NoticeReach | null;
    now?: number;
    onClose: () => void;
}) {
    const router = useRouter();
    const [picked, setPicked] = useState<string | null>(null);
    const [taken, setTaken] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [busy, setBusy] = useState(false);
    const [refused, setRefused] = useState<string | null>(null);
    const first = firstName(booking.who);

    async function submit() {
        if (!picked || busy) return;
        const to = picked;
        const res = await runAction(() => rescheduleBooking(booking.id, to), {
            setBusy,
        });
        if (!res) return;
        if (!res.ok) {
            if (isTakenRefusal(res.error)) {
                // The picker says it was just taken, and reads again.
                setTaken(to);
                setPicked(null);
                setReload((n) => n + 1);
                setRefused(null);
            } else {
                setRefused(res.error);
            }
            return;
        }
        const told = movedToldText(reach, first);
        onClose();
        router.refresh();
        showUndo(
            `Moved ${first || "the booking"} to ${formatDateTime(to, timezone, { weekday: "short", relative: "lower", now })}.${told ? ` ${told}` : ""}`,
            async () => {
                const back = await rescheduleBooking(
                    booking.id,
                    booking.startAt,
                );
                router.refresh();
                return back;
            },
        );
    }

    return (
        <>
            <FormSheetBody className="gap-3.5">
                {refused ? <Notice tone="error">{refused}</Notice> : null}
                <TimePicker
                    serviceId={booking.serviceId}
                    timezone={timezone}
                    value={picked}
                    onChange={(at) => {
                        setPicked(at === booking.startAt ? null : at);
                        if (at) setTaken(null);
                        setRefused(null);
                    }}
                    people={booking.staff ? [booking.staff] : []}
                    withId={booking.staff?.id ?? null}
                    taken={taken}
                    reloadKey={reload}
                    initialDay={localDateOf(booking.startAt, timezone)}
                    now={now}
                />
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    Only times{" "}
                    {booking.staff
                        ? `${firstName(booking.staff.name)} is`
                        : "the service is"}{" "}
                    free and nobody has taken.
                    {booking.freeCancelUntil
                        ? ` Moving keeps its free-cancel time: ${deadlineText(booking.freeCancelUntil, timezone)}.`
                        : ""}
                </p>
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={
                    picked ? `Move to ${formatTime(picked, timezone)}` : "Move"
                }
                savingLabel="Moving…"
                saveOff={!picked}
                pending={busy}
                onSubmit={submit}
            />
        </>
    );
}
