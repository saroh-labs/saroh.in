"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TimePicker } from "@/components/bookings/sheets/time-picker";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/forms/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { formatDateTime } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import { rescheduleBooking } from "@/lib/services/actions";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import { localDateOf, whoFor } from "@/lib/services/diary";

/**
 * "Move to another time" from a row's menu (U11): the one time picker
 * (U3) in a sheet, a bottom sheet on a phone and the right-hand panel at
 * a desk. It offers only free times of the person the booking is with,
 * from the day it is on; Move makes it, and the list reads again. A
 * refusal (the time was just taken) keeps the sheet open on fresh times.
 */
export function MoveSheet({
    booking,
    timezone,
    returnFocusTo,
    onClose,
}: {
    /** The booking being moved; null while the sheet is shut. */
    booking: DiaryBooking | null;
    /** The business's zone (Q10). */
    timezone: string;
    returnFocusTo?: () => HTMLElement | null | undefined;
    onClose: () => void;
}) {
    const [kept, setKept] = useState<DiaryBooking | null>(booking);
    // Keep the last booking through the closing slide, so it does not blank.
    if (booking && booking !== kept) setKept(booking);
    const shown = booking ?? kept;
    const first = shown ? firstName(whoFor(shown)) : "";
    return (
        <FormSheet
            open={booking !== null}
            bottomOnPhone
            wide
            title={first ? `Move ${first}'s booking` : "Move this booking"}
            description={
                shown
                    ? `${shown.service.name}, now ${formatDateTime(shown.startAt, timezone, { weekday: "short", relative: "lower" })}. Only free times are shown.`
                    : ""
            }
            returnFocusTo={returnFocusTo}
            onClose={onClose}
        >
            {booking ? (
                <MoveDraft
                    key={booking.id}
                    booking={booking}
                    timezone={timezone}
                    onClose={onClose}
                />
            ) : null}
        </FormSheet>
    );
}

function MoveDraft({
    booking,
    timezone,
    onClose,
}: {
    booking: DiaryBooking;
    timezone: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const [startAt, setStartAt] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const person = booking.staff
        ? { id: booking.staff.id, name: booking.staff.name }
        : null;

    async function submit() {
        if (!startAt || busy) return;
        const res = await runAction(
            () => rescheduleBooking(booking.id, startAt),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            // Most often the time was just taken: the times are read
            // again and the sheet stays open on them.
            showError(res.error);
            setStartAt(null);
            setReload((n) => n + 1);
            return;
        }
        showSuccess(
            `Moved ${firstName(whoFor(booking)) || "the booking"} to ${formatDateTime(startAt, timezone, { weekday: "short", relative: "lower" })}.`,
        );
        onClose();
        router.refresh();
    }

    return (
        <>
            <FormSheetBody className="gap-3.5">
                <TimePicker
                    serviceId={booking.service.id}
                    timezone={timezone}
                    value={startAt}
                    onChange={(at) => setStartAt(at)}
                    people={person ? [person] : []}
                    withId={person?.id ?? null}
                    reloadKey={reload}
                    initialDay={localDateOf(booking.startAt, timezone)}
                />
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Move"
                savingLabel="Moving…"
                saveOff={!startAt || startAt === booking.startAt}
                pending={busy}
                onSubmit={submit}
            />
        </>
    );
}
