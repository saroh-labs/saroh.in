"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { formatTimeRange } from "@/lib/format/datetime";
import { listAvailability, rescheduleBooking } from "@/lib/services/actions";
import type { Slot } from "@/lib/services/service";

/**
 * Move a booking to another slot (#121).
 *
 * OFFERS ONLY REAL OPEN SLOTS — times the service is actually open for and
 * nobody else has taken. The api enforces the same rule with the same function
 * the public booking form passes, so this picker cannot offer something the
 * server would then refuse, and a merchant cannot land a customer at a time
 * nothing else in the product believes in.
 *
 * The window starts at now and runs four weeks; "Look further ahead" extends
 * it rather than paging, because a merchant rescheduling is looking for the
 * first thing that works, not browsing a calendar.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_WEEKS = 4;

export function RescheduleBooking({
    bookingId,
    serviceId,
    timezone,
    currentStartAt,
    currentEndAt,
}: {
    bookingId: string;
    serviceId: string;
    timezone: string;
    currentStartAt: string;
    currentEndAt: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [weeks, setWeeks] = useState(INITIAL_WEEKS);
    // Held with the window it was loaded for, so "still loading" is DERIVED
    // rather than set — a synchronous reset inside the effect would cascade a
    // second render on every open.
    const [loaded, setLoaded] = useState<{
        weeks: number;
        slots: Slot[];
    } | null>(null);
    const [pending, startTransition] = useTransition();

    // Loaded when the dialog opens, not on page render: most visits to a
    // booking are to read it, and availability is a fan-out the api should not
    // be asked for until a merchant actually intends to move something.
    useEffect(() => {
        if (!open) return;
        let live = true;
        const from = new Date().toISOString();
        const to = new Date(Date.now() + weeks * WEEK_MS).toISOString();
        void listAvailability(serviceId, from, to).then((found) => {
            if (live) setLoaded({ weeks, slots: found });
        });
        return () => {
            live = false;
        };
    }, [open, weeks, serviceId]);

    const slots = loaded?.weeks === weeks ? loaded.slots : null;

    const move = (startAt: string) => {
        startTransition(async () => {
            const res = await rescheduleBooking(bookingId, startAt);
            if (!res.ok) {
                // The api refuses a slot taken between this list loading and
                // the click. Saying so plainly beats a generic failure.
                toast.error(res.error);
                return;
            }
            toast.success("Booking moved");
            setOpen(false);
            router.refresh();
        });
    };

    // The slot it is in now is not somewhere to move it to.
    const options = (slots ?? []).filter((s) => s.startAt !== currentStartAt);
    const byDay = groupByDay(options, timezone);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="wk-press"
                >
                    Reschedule
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Move this booking</DialogTitle>
                    <DialogDescription>
                        Currently{" "}
                        {formatTimeRange(
                            currentStartAt,
                            currentEndAt,
                            timezone,
                        )}
                        , {timezone}. Only times this service is open and nobody
                        else has taken are shown.
                    </DialogDescription>
                </DialogHeader>

                {slots === null ? (
                    <p className="py-6 text-sm text-muted-foreground">
                        Finding open times…
                    </p>
                ) : byDay.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">
                        No open times in the next {weeks} weeks. Opening more
                        hours on this service, in Services → availability, adds
                        times here.
                    </p>
                ) : (
                    <div className="grid gap-4">
                        {byDay.map(([day, daySlots]) => (
                            <div key={day}>
                                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                    {day}
                                </h3>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {daySlots.map((slot) => (
                                        <button
                                            key={slot.startAt}
                                            type="button"
                                            disabled={pending}
                                            onClick={() => move(slot.startAt)}
                                            className={cn(
                                                "wk-press rounded-md border border-border px-3 py-1.5 text-sm tabular-nums",
                                                "hover:border-brand/40 hover:bg-brand-subtle",
                                                "disabled:pointer-events-none disabled:opacity-50",
                                            )}
                                        >
                                            {clockTime(slot.startAt, timezone)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {slots !== null ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="justify-self-start"
                        disabled={pending}
                        onClick={() => setWeeks((w) => w + INITIAL_WEEKS)}
                    >
                        Look further ahead
                    </Button>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

/** Slots grouped under the day they fall on IN THE BOOKING'S ZONE. */
function groupByDay(slots: Slot[], timeZone: string): [string, Slot[]][] {
    const days = new Map<string, Slot[]>();
    const label = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
    });
    for (const slot of slots) {
        const key = label.format(new Date(slot.startAt));
        const bucket = days.get(key);
        if (bucket) bucket.push(slot);
        else days.set(key, [slot]);
    }
    return Array.from(days.entries());
}

function clockTime(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(iso));
}
