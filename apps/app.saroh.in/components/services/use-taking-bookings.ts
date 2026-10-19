"use client";

import type { ToastId } from "@saroh/ui/toast";
import { dismissToast, showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { updateService } from "@/lib/services/actions";
import type { WhoFields } from "@/lib/services/service-cards";
import {
    pauseToast,
    takingPatch,
    whoPatch,
} from "@/lib/services/service-cards";
import type { Bookers } from "@/lib/services/service-form";
import { bookersPatch, bookersToast } from "@/lib/services/service-form";

/** How a caller draws a write: a change to the fields it shows now. */
export type OnSet = (change: (now: WhoFields) => WhoFields) => void;

/**
 * "Who can book it" as it is changed (Bookings audit, 12 Oct 2026;
 * DEC-170 Q5): from a service's row and from its own page, it acts at
 * once and asks nothing, since it can be put back: the toast says what
 * happened and offers Undo, which puts back exactly the boxes it had.
 *
 * `setTakingWho` is the "Taking bookings" switch (the Services list, U15):
 * off unticks both boxes, so nobody can book it and bookings already made
 * stay; on ticks both back. `setBookers` is a tick on the service's own
 * page (U16): any of the four mixes, neither being paused.
 *
 * `onSet` is how the caller draws it: handed a change to make to what it
 * shows now. At once it sets the fields this write changed; if the save
 * didn't go through, or Undo puts it back, it sets those same fields back,
 * leaving any other tick made since as it is. Only the latest write keeps
 * its Undo.
 */
export function useTakingBookings() {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);
    const lastUndo = useRef<ToastId | null>(null);

    async function write(
        service: { id: string } & WhoFields,
        patch: Partial<WhoFields>,
        said: string,
        onSet: OnSet,
    ) {
        const was: WhoFields = {
            status: service.status,
            showOnBookingPage: service.showOnBookingPage,
            bookableByTeam: service.bookableByTeam,
        };
        const next: WhoFields = { ...was, ...patch };
        // Only the fields this write changes, and what they were.
        const back = whoPatch(next, was);
        onSet((now) => ({ ...now, ...whoPatch(was, next) }));
        const res = await runAction(() => updateService(service.id, patch), {
            setBusy: (on) => setBusy(on ? service.id : null),
        });
        if (!res?.ok) {
            // Drawn before its save: put it back.
            onSet((now) => ({ ...now, ...back }));
            if (res) showError(res.error);
            return;
        }
        router.refresh();
        if (lastUndo.current !== null) dismissToast(lastUndo.current);
        lastUndo.current = showUndo(said, async () => {
            const undone = await runAction(
                () => updateService(service.id, back),
                { quiet: true },
            );
            if (!undone) return { ok: false, error: UNREACHED };
            if (undone.ok) {
                onSet((now) => ({ ...now, ...back }));
                router.refresh();
            }
            return undone;
        });
    }

    function setTakingWho(
        service: { id: string; name: string } & WhoFields,
        taking: boolean,
        onSet: OnSet,
    ) {
        return write(
            service,
            takingPatch(taking),
            pauseToast(service.name, taking),
            onSet,
        );
    }

    function setBookers(
        service: { id: string; name: string } & WhoFields,
        next: Bookers,
        onSet: OnSet,
    ) {
        return write(
            service,
            bookersPatch(next),
            bookersToast(service.name, next),
            onSet,
        );
    }

    return {
        /** The id of the service whose ticks or switch are saving, or null. */
        busy,
        setTakingWho,
        setBookers,
    };
}
