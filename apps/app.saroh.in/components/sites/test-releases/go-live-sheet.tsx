"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError } from "@saroh/ui/toast";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import type { GoLiveTarget } from "@/components/sites/editor/use-test-releases";
import type {
    GoLiveGate,
    GoLiveResult,
    TestRelease,
} from "@/lib/sites/test-releases";
import {
    nextSlot,
    OVERRIDE_RECORD,
    replacesLine,
    zoneName,
} from "@/lib/sites/test-releases";
import {
    goLiveWithRelease,
    scheduleGoLive,
} from "@/lib/sites/test-releases-actions";

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
export function GoLiveSheet({
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
    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="sm:max-w-[480px]">
                {target && gate ? (
                    // Keyed so each opening starts on its own mode and time.
                    <Body
                        key={`${target.release.id}:${target.mode}`}
                        {...{ siteId, target, gate, zone, livePublishedAt }}
                        {...{ onClose, onWentLive, onScheduled }}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function Body({
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
    target: GoLiveTarget;
    gate: GoLiveGate;
    zone: string;
    livePublishedAt: string | null;
    onClose: () => void;
    onWentLive: (result: GoLiveResult) => void;
    onScheduled: (release: TestRelease) => void;
}) {
    const { release } = target;
    const [mode, setMode] = useState(target.mode);
    const slot = nextSlot(new Date(), zone);
    const [date, setDate] = useState<Date | undefined>(dateFrom(slot.date));
    const [time, setTime] = useState(slot.time);
    const [busy, setBusy] = useState(false);

    const override = gate.kind === "override";
    const blocked = gate.kind === "blocked";
    const now = mode === "now";

    async function confirm() {
        setBusy(true);
        if (now) {
            const res = await goLiveWithRelease(siteId, release.id, override);
            setBusy(false);
            if (!res.ok) return showError(res.error);
            onWentLive(res.data);
            return;
        }
        if (!date) {
            setBusy(false);
            return showError("Pick a date to go live.");
        }
        const res = await scheduleGoLive(siteId, release.id, {
            date: dayOf(date),
            time,
            ...(override ? { override: true } : {}),
        });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        onScheduled(res.data);
    }

    const label = busy
        ? now
            ? "Going live…"
            : "Scheduling…"
        : override
          ? now
              ? "Go live without approval"
              : "Schedule without approval"
          : now
            ? "Go live now"
            : "Schedule go-live";

    return (
        <>
            <DialogHeader>
                <DialogTitle>Go live with {release.name}</DialogTitle>
                <DialogDescription>
                    Puts exactly this test release live, as it was frozen,
                    whatever your draft says now.
                </DialogDescription>
            </DialogHeader>

            <div
                role="radiogroup"
                aria-label="When it goes live"
                className="flex w-fit rounded-lg border p-0.5"
            >
                {(
                    [
                        ["now", "Now"],
                        ["schedule", "At a date and time"],
                    ] as const
                ).map(([key, text]) => (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={mode === key}
                        onClick={() => setMode(key)}
                        className={cn(
                            "min-h-8 rounded-md px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                            mode === key
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent-active",
                        )}
                    >
                        {text}
                    </button>
                ))}
            </div>

            {now ? (
                <p className="text-sm">{replacesLine(livePublishedAt, zone)}</p>
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
                        In {zoneName(zone)}, your business&apos;s time zone. You
                        can cancel it until then, and your team is told when it
                        goes live. If the site is published before then, it
                        won&apos;t go live, and you&apos;re told why.
                    </p>
                </div>
            )}

            {release.draftChangedSince ? (
                <p className="text-[12.5px] leading-normal text-muted-foreground">
                    Your draft has changed since this was made. Those changes
                    stay in the draft.
                </p>
            ) : null}

            {override ? (
                <div
                    role="note"
                    className="flex gap-2.5 rounded-lg bg-destructive-subtle px-3.5 py-3 text-[12.5px] leading-normal text-destructive-subtle-foreground"
                >
                    <ShieldAlert
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0"
                    />
                    <p>
                        {gate.why} As an owner you can go live without it.{" "}
                        {OVERRIDE_RECORD}
                    </p>
                </div>
            ) : null}
            {blocked ? (
                <p role="note" className="text-[12.5px] text-muted-foreground">
                    {gate.why}
                </p>
            ) : null}

            <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    variant={override ? "destructive" : "default"}
                    disabled={busy || blocked}
                    onClick={() => void confirm()}
                >
                    {label}
                </Button>
            </DialogFooter>
        </>
    );
}
