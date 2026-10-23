"use client";

import { Button } from "@saroh/ui/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { withoutArrival } from "@/lib/customers/prefill";

import { LauncherContext, useNewBookingLauncher } from "./launcher";
import { NewBookingFlow } from "./new-booking-flow";
import type { NewBookingPrefill, NewBookingSetup } from "./setup";

/**
 * Holds New booking for a page (U8): the one flow, opened by whatever is
 * under it with what that way in knows, or on arrival (`?new=1`, with a
 * `date` from the Calendar's "Book on this day" and a `contactId` from a
 * customer's page). Closing it with something chosen or typed asks
 * "Discard what you typed?" first; once booked, it closes at once.
 */
export function NewBookingHost({
    setup,
    arrival = null,
    children,
}: {
    setup: NewBookingSetup;
    /** Opened by the address (`?new=1`): what it says. */
    arrival?: NewBookingPrefill | null;
    children: ReactNode;
}) {
    const router = useRouter();
    const [prefill, setPrefill] = useState<NewBookingPrefill | null>(arrival);
    const [arrived, setArrived] = useState(arrival !== null);
    // Each opening, and "Add another booking", starts a fresh flow.
    const [round, setRound] = useState(0);
    const [asking, setAsking] = useState(false);
    const dirty = useRef(false);
    const onDirty = useCallback((next: boolean) => {
        dirty.current = next;
    }, []);

    const open = useCallback((next: NewBookingPrefill = {}) => {
        dirty.current = false;
        setRound((n) => n + 1);
        setPrefill(next);
    }, []);
    const launcher = useMemo(() => ({ open }), [open]);

    function shut() {
        setAsking(false);
        setPrefill(null);
        dirty.current = false;
        if (!arrived) return;
        // Opened by `?new=1`: once closed, the page's own address, so a
        // reload doesn't open it again.
        setArrived(false);
        router.replace(
            withoutArrival(window.location.pathname, window.location.search),
            { scroll: false },
        );
    }

    return (
        <LauncherContext.Provider value={launcher}>
            {children}
            <FormSheet
                open={prefill !== null}
                flow
                ownHeader
                title="New booking"
                description="Who it is for, what, with whom and when, then book."
                onClose={() => {
                    if (dirty.current) setAsking(true);
                    else shut();
                }}
            >
                {prefill ? (
                    <NewBookingFlow
                        key={round}
                        setup={setup}
                        prefill={prefill}
                        onDirty={onDirty}
                        onAgain={() => open({})}
                        onDone={shut}
                    />
                ) : null}
            </FormSheet>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                tone="neutral"
                title="Discard what you typed?"
                description="Nothing is booked yet. Closing drops who and what you picked."
                confirmLabel="Discard"
                busyLabel="Discarding…"
                keepLabel="Keep booking"
                onConfirm={() => shut()}
            />
        </LauncherContext.Provider>
    );
}

/**
 * New booking's button, under a host: never greyed (BA-18). With no
 * service yet the flow says "Add a service first" and how.
 */
export function NewBookingButton({
    className,
    plain = false,
    date,
}: {
    className?: string;
    /** Words only, as the calendar's header draws it. */
    plain?: boolean;
    /** Open on this day. */
    date?: string | null;
}) {
    const launcher = useNewBookingLauncher();
    return (
        <Button
            type="button"
            className={className}
            onClick={() => launcher?.open(date ? { date } : {})}
        >
            {plain ? null : <Plus className="mr-1.5 size-4" />}
            New booking
        </Button>
    );
}
