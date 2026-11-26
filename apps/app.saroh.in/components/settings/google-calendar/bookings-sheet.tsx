"use client";

import { CheckRow } from "@saroh/ui/check-row";
import { RadioCards } from "@saroh/ui/choice-group";
import { FormSheet } from "@saroh/ui/form-sheet";
import { useEffect, useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import {
    accountCalendars,
    moveMyBookings,
    saveAccountCalendars,
} from "@/lib/google-calendar/actions";
import type {
    CalendarStatus,
    GoogleCalendarOption,
} from "@/lib/google-calendar/types";
import type { OutcomeMessage } from "@/lib/google-calendar/words";
import { asOrg, useSettingsSave } from "@/lib/settings/use-settings";

/** Drawn only while open, so each opening starts from what is saved. */
export function BookingsSheet(props: {
    status: CalendarStatus;
    open: boolean;
    onClose: () => void;
    onSaid: (message: OutcomeMessage) => void;
}) {
    return props.open ? <OpenBookingsSheet {...props} /> : null;
}

/**
 * Where new bookings go (the Bookings card's Change, DEC-233): one
 * calendar across all your Google accounts, from the ones Saroh may write
 * to. Choosing another moves nothing by itself; "Move my upcoming bookings"
 * puts them there too (new Meet links, the customers invited).
 */
function OpenBookingsSheet({
    status,
    open,
    onClose,
    onSaid,
}: {
    status: CalendarStatus;
    open: boolean;
    onClose: () => void;
    onSaid: (message: OutcomeMessage) => void;
}) {
    const settings = useSettingsSave();
    const labelId = useId();
    const accounts = status.accounts.filter((a) => a.state === "CONNECTED");
    const [lists, setLists] = useState<
        Record<string, GoogleCalendarOption[] | null>
    >({});
    const current = status.bookingsGoTo
        ? `${status.bookingsGoTo.accountId}|${status.bookingsGoTo.calendarId}`
        : null;
    const [choice, setChoice] = useState<string | null>(current);
    const [move, setMove] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ids = accounts.map((a) => a.id).join();
    useEffect(() => {
        if (!open) return;
        let live = true;
        for (const id of ids.split(",").filter(Boolean)) {
            accountCalendars(id)
                .then((list) => {
                    if (live) setLists((l) => ({ ...l, [id]: list }));
                })
                .catch(() => undefined);
        }
        return () => {
            live = false;
        };
    }, [open, ids, current]);

    const options = accounts.flatMap((a) => {
        const list =
            lists[a.id] ??
            a.calendars.map((c) => ({
                id: c.id,
                name: c.name,
                primary: c.writeTo,
                canWrite: true,
            }));
        return list
            .filter((c) => c.canWrite)
            .map((c) => ({
                value: `${a.id}|${c.id}`,
                label: c.name,
                note: a.googleEmail,
            }));
    });

    async function save() {
        if (!choice) return;
        const [accountId, calendarId] = choice.split("|");
        const account = accounts.find((a) => a.id === accountId);
        if (!account || !calendarId) return;
        setError(null);
        if (choice !== current) {
            const res = await runAction(
                () =>
                    saveAccountCalendars(
                        accountId,
                        {
                            writeTo: calendarId,
                            checkBusy: account.calendars
                                .filter((c) => c.checkBusy)
                                .map((c) => c.id),
                        },
                        ...asOrg(settings.orgId),
                    ),
                { setBusy: setPending, onUnreached: setError, quiet: true },
            );
            if (!res) return;
            if (!res.ok) return setError(res.error);
        }
        if (move) {
            const moved = await runAction(
                () => moveMyBookings(...asOrg(settings.orgId)),
                {
                    setBusy: setPending,
                    onUnreached: setError,
                    quiet: true,
                },
            );
            if (!moved) return;
            if (!moved.ok) return setError(moved.error);
            onSaid({
                tone: "success",
                title: "Moving your bookings",
                body: moved.data.message,
            });
        }
        onClose();
        settings.saved();
    }

    return (
        <FormSheet
            open={open}
            title="Where bookings go"
            description="The one calendar your new bookings go on, across your Google accounts."
            pending={pending}
            dirty={choice !== current || move}
            onClose={onClose}
            onSubmit={() => save()}
            fieldsClassName="gap-5"
        >
            <div className="grid gap-2">
                <p
                    data-ph-unmask=""
                    id={labelId}
                    className="m-0 text-[13.5px] font-semibold"
                >
                    New bookings go on
                </p>
                <RadioCards
                    labelledBy={labelId}
                    value={choice}
                    onChange={setChoice}
                    options={options}
                />
                <p
                    data-ph-unmask=""
                    className="m-0 text-[12.5px] text-muted-foreground"
                >
                    Shared and holiday calendars aren’t listed: Saroh can only
                    read them.
                </p>
            </div>
            <CheckRow
                checked={move}
                onChange={setMove}
                className="items-start rounded-[9px] border border-border bg-card px-3 py-2.5"
            >
                <span className="grid">
                    <span data-ph-unmask="" className="font-semibold">
                        Move my upcoming bookings there too
                    </span>
                    <span
                        data-ph-unmask=""
                        className="text-[12px] text-muted-foreground"
                    >
                        Each gets a new Meet link where it has one, and Google
                        invites the customer.
                    </span>
                </span>
            </CheckRow>
            {error ? (
                <p role="alert" className="m-0 text-[13px] text-destructive">
                    {error}
                </p>
            ) : null}
        </FormSheet>
    );
}
