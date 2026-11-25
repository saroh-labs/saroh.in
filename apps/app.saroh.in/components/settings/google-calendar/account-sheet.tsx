"use client";

import { Button } from "@saroh/ui/button";
import { CheckRow } from "@saroh/ui/check-row";
import { FormSheet } from "@saroh/ui/form-sheet";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import {
    disconnectAccount,
    saveAccountCalendars,
} from "@/lib/google-calendar/actions";
import type {
    CalendarAccount,
    CalendarStatus,
} from "@/lib/google-calendar/types";
import type { OutcomeMessage } from "@/lib/google-calendar/words";
import { GC_WORDS } from "@/lib/google-calendar/words";
import { asOrg, useSettingsSave } from "@/lib/settings/use-settings";

import { DisconnectDialog } from "./disconnect-dialog";
import { useAccountCalendars } from "./use-calendars";

/**
 * One Google account's sheet (board GC2AccountSheet): which of its
 * calendars keep customers off your busy times (many), whether new
 * bookings go here (the one place across all your accounts), and
 * Disconnect this account. Shared and holiday calendars can only block
 * time: Saroh can't write to them.
 */
export function AccountSheet(props: {
    account: CalendarAccount | null;
    status: CalendarStatus;
    onClose: () => void;
    onSaid: (message: OutcomeMessage) => void;
}) {
    // Each opening starts from the account as it is now.
    return props.account ? (
        <OpenAccountSheet
            key={props.account.id}
            {...props}
            account={props.account}
        />
    ) : null;
}

function OpenAccountSheet({
    account,
    status,
    onClose,
    onSaid,
}: {
    account: CalendarAccount;
    status: CalendarStatus;
    onClose: () => void;
    onSaid: (message: OutcomeMessage) => void;
}) {
    const settings = useSettingsSave();
    const open = true;
    const { options } = useAccountCalendars(account, open);
    const [busy, setBusy] = useState<string[]>(() =>
        account.calendars.filter((c) => c.checkBusy).map((c) => c.id),
    );
    const [putHere, setPutHere] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    const goes = status.bookingsGoTo;
    const here = goes?.accountId === account.id;
    const writable =
        options.find((o) => o.primary && o.canWrite) ??
        options.find((o) => o.canWrite) ??
        null;
    const before = account.calendars
        .filter((c) => c.checkBusy)
        .map((c) => c.id)
        .sort()
        .join();

    async function save() {
        setError(null);
        const res = await runAction(
            () =>
                saveAccountCalendars(
                    account.id,
                    {
                        checkBusy: busy,
                        ...(putHere && writable
                            ? { writeTo: writable.id }
                            : {}),
                    },
                    ...asOrg(settings.orgId),
                ),
            { setBusy: setPending, onUnreached: setError, quiet: true },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        onClose();
        settings.saved();
    }

    async function disconnect() {
        const res = await disconnectAccount(
            account.id,
            ...asOrg(settings.orgId),
        );
        if (!res.ok) return { ok: false, error: res.error };
        onClose();
        onSaid({
            tone: "success",
            title: "Disconnected",
            body: res.data.kept.message,
        });
        settings.saved();
        return { ok: true };
    }

    return (
        <>
            <FormSheet
                open={!confirming}
                title={account.googleEmail}
                description="Which calendars keep customers off your busy times, and whether your bookings go here."
                pending={pending}
                dirty={putHere || busy.slice().sort().join() !== before}
                onClose={onClose}
                onSubmit={() => save()}
                fieldsClassName="gap-6"
            >
                <fieldset className="grid gap-2">
                    <legend className="mb-2 text-[13.5px] font-semibold">
                        {GC_WORDS.busyHeading}
                    </legend>
                    {options.map((o) => (
                        <CheckRow
                            key={o.id}
                            checked={busy.includes(o.id)}
                            onChange={(on) =>
                                setBusy((b) =>
                                    on
                                        ? [...b, o.id]
                                        : b.filter((x) => x !== o.id),
                                )
                            }
                            className="rounded-[9px] border border-border bg-card px-3 py-2.5"
                        >
                            <span className="grid">
                                <span className="font-semibold">{o.name}</span>
                                <span
                                    data-ph-unmask=""
                                    className="text-[12px] text-muted-foreground"
                                >
                                    {o.canWrite ? "Yours" : "Shared with you"}
                                </span>
                            </span>
                        </CheckRow>
                    ))}
                </fieldset>

                <section className="grid gap-2">
                    <h3 className="m-0 text-[13.5px] font-semibold">
                        {GC_WORDS.bookings}
                    </h3>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-3.5 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="m-0 text-[13.5px] font-semibold">
                                {here
                                    ? `Written here, on ${goes.name}`
                                    : putHere && writable
                                      ? `They go on ${writable.name} once you save`
                                      : "Not written here"}
                            </p>
                            <p className="m-0 text-[12.5px] text-muted-foreground">
                                {here
                                    ? "New bookings go on this calendar, moved and cancelled there too."
                                    : goes
                                      ? `New bookings go on ${goes.name}, in ${goes.googleEmail}.`
                                      : "New bookings don't go to Google yet."}
                            </p>
                        </div>
                        {!here &&
                        !putHere &&
                        writable &&
                        account.state === "CONNECTED" ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPutHere(true)}
                            >
                                {GC_WORDS.putThemHere}
                            </Button>
                        ) : null}
                    </div>
                </section>

                {error ? (
                    <p
                        role="alert"
                        className="m-0 text-[13px] text-destructive"
                    >
                        {error}
                    </p>
                ) : null}

                <section className="mt-auto grid gap-2 pt-4">
                    <h3 className="m-0 text-[13.5px] font-semibold">
                        {GC_WORDS.disconnect}
                    </h3>
                    <p
                        data-ph-unmask=""
                        className="m-0 text-[12.5px] text-muted-foreground"
                    >
                        Its events stop blocking your times. What’s on your
                        Google Calendar stays as it is.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="justify-self-start text-destructive"
                        onClick={() => setConfirming(true)}
                    >
                        {GC_WORDS.disconnectAccount}
                    </Button>
                </section>
            </FormSheet>
            <DisconnectDialog
                email={account.googleEmail}
                open={confirming}
                onOpenChange={setConfirming}
                onConfirm={disconnect}
            />
        </>
    );
}
