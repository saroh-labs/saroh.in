"use client";

import { DatePicker } from "@saroh/ui/date-picker";
import { Label } from "@saroh/ui/label";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError } from "@saroh/ui/toast";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import {
    FormDialog,
    FormDialogFoot,
} from "@/components/shared/forms/form-dialog";
import type { GoLiveTarget } from "@/components/sites/editor/use-test-releases";
import { runAction } from "@/lib/api/run-action";
import type {
    GoLiveGate,
    GoLiveResult,
    TestRelease,
} from "@/lib/sites/test-releases";
import {
    changesAskedLine,
    nextSlot,
    OVERRIDE_RECORD,
    replacesLine,
    zoneName,
} from "@/lib/sites/test-releases";
import {
    goLiveWithRelease,
    scheduleGoLive,
} from "@/lib/sites/test-releases-actions";
import { Notice } from "@saroh/ui/notice";
import { Segmented } from "@saroh/ui/segmented";

/** A calendar day picked in the browser, as the API reads it. */
function dayOf(date: Date): string {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
}

function dateFrom(key: string): Date {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Go live with a test release (DEC-071, R8, R9, R10): now, or at a date and
 * time in the business's time zone. It says what it replaces before it does
 * it, and that the draft is left alone. With "Publishing needs approval" on
 * and the release not approved, an owner sees the destructive "Go live
 * without approval", which names the record it leaves; anyone else never
 * gets here (the row says why its Go live is disabled).
 */
export function GoLiveDialog({
    siteId,
    target,
    gate,
    zone,
    livePublishedAt,
    onClose,
    onWentLive,
    onScheduled,
}: {
    siteId: string;
    target: GoLiveTarget | null;
    /** What the row worked out for this person and this release. */
    gate: GoLiveGate | null;
    /** The business's time zone, the one the date and time are in. */
    zone: string;
    /** When the live version went live; null if nothing is live. */
    livePublishedAt: string | null;
    onClose: () => void;
    onWentLive: (result: GoLiveResult) => void;
    onScheduled: (release: TestRelease) => void;
}) {
    const [busy, setBusy] = useState(false);
    return (
        <FormDialog
            open={target !== null}
            size="lg"
            title={target ? `Go live with ${target.release.name}` : "Go live"}
            description="Puts exactly this test release live, as it was frozen, whatever your draft says now."
            pending={busy}
            onClose={onClose}
        >
            {target && gate ? (
                // Keyed so each opening starts on its own mode and time.
                <Body
                    key={`${target.release.id}:${target.mode}`}
                    {...{ siteId, target, gate, zone, livePublishedAt }}
                    {...{ onWentLive, onScheduled, setBusy }}
                />
            ) : null}
        </FormDialog>
    );
}

function Body({
    siteId,
    target,
    gate,
    zone,
    livePublishedAt,
    onWentLive,
    onScheduled,
    setBusy,
}: {
    siteId: string;
    target: GoLiveTarget;
    gate: GoLiveGate;
    zone: string;
    livePublishedAt: string | null;
    onWentLive: (result: GoLiveResult) => void;
    onScheduled: (release: TestRelease) => void;
    setBusy: (busy: boolean) => void;
}) {
    const { release } = target;
    const [mode, setMode] = useState(target.mode);
    const slot = nextSlot(new Date(), zone);
    const [date, setDate] = useState<Date | undefined>(dateFrom(slot.date));
    const [time, setTime] = useState(slot.time);

    const override = gate.kind === "override";
    const blocked = gate.kind === "blocked";
    const now = mode === "now";

    async function confirm() {
        setBusy(true);
        if (now) {
            const res = await runAction(
                () => goLiveWithRelease(siteId, release.id, override),
                { setBusy },
            );
            if (!res) return;
            if (!res.ok) return showError(res.error);
            onWentLive(res.data);
            return;
        }
        if (!date) {
            setBusy(false);
            return showError("Pick a date to go live.");
        }
        const res = await runAction(
            () =>
                scheduleGoLive(siteId, release.id, {
                    date: dayOf(date),
                    time,
                    ...(override ? { override: true } : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onScheduled(res.data);
    }

    const label = override
        ? now
            ? "Go live without approval"
            : "Schedule without approval"
        : now
          ? "Go live now"
          : "Schedule go-live";

    return (
        <>
            <div className="grid gap-4">
                <Segmented
                    label="When it goes live"
                    value={mode}
                    onValueChange={setMode}
                    options={[
                        { value: "now", label: "Now" },
                        { value: "schedule", label: "At a date and time" },
                    ]}
                />

                {now ? (
                    <p className="text-sm">
                        {replacesLine(livePublishedAt, zone)}
                    </p>
                ) : (
                    <div className="grid gap-3">
                        <div className="flex flex-wrap gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="go-live-date">Date</Label>
                                <DatePicker
                                    id="go-live-date"
                                    value={date}
                                    onValueChange={setDate}
                                    disabledDays={{
                                        before: dateFrom(slot.date),
                                    }}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="go-live-time">Time</Label>
                                <TimeSelect
                                    id="go-live-time"
                                    value={time}
                                    onValueChange={setTime}
                                />
                            </div>
                        </div>
                        <p className="text-[12.5px] leading-normal text-muted-foreground">
                            In {zoneName(zone)}, your business&apos;s time zone.
                            You can cancel it until then, and your team is told
                            when it goes live. If the site is published before
                            then, it won&apos;t go live, and you&apos;re told
                            why.
                        </p>
                    </div>
                )}

                {/* A reviewer asked for changes here (UX-068): said before the
            press, not only in Versions afterwards. */}
                {changesAskedLine(release.standing) ? (
                    <Notice tone="warning" role="note">
                        {changesAskedLine(release.standing)}
                    </Notice>
                ) : null}

                {release.draftChangedSince ? (
                    <p className="text-[12.5px] leading-normal text-muted-foreground">
                        Your draft has changed since this was made. Those
                        changes stay in the draft.
                    </p>
                ) : null}

                {override ? (
                    <Notice tone="error" role="note">
                        <div className="flex gap-2.5">
                            <ShieldAlert
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0"
                            />
                            <p>
                                {gate.why} As an owner you can go live without
                                it. {OVERRIDE_RECORD}
                            </p>
                        </div>
                    </Notice>
                ) : null}
                {blocked ? (
                    <p
                        role="note"
                        className="text-[12.5px] text-muted-foreground"
                    >
                        {gate.why}
                    </p>
                ) : null}
            </div>
            <FormDialogFoot
                tone={override ? "destructive" : "default"}
                saveLabel={label}
                savingLabel={now ? "Going live…" : "Scheduling…"}
                saveOff={blocked}
                onSubmit={confirm}
            />
        </>
    );
}
