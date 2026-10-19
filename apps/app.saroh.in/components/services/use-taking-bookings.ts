"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
 * `onSet` is how the caller draws it: called with the new state at once,
 * with the old one again if the save didn't go through, and with the old
 * one when Undo puts it back.
 */
export function useTakingBookings() {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    async function write(
        service: { id: string } & WhoFields,
        patch: Partial<WhoFields>,
        said: string,
        onSet: (who: WhoFields) => void,
    ) {
        const was: WhoFields = {
            status: service.status,
            showOnBookingPage: service.showOnBookingPage,
            bookableByTeam: service.bookableByTeam,
        };
        const next: WhoFields = { ...was, ...patch };
        onSet(next);
        const res = await runAction(() => updateService(service.id, patch), {
            setBusy: (on) => setBusy(on ? service.id : null),
        });
        if (!res?.ok) {
            // Drawn before its save: put it back.
            onSet(was);
            if (res) showError(res.error);
            return;
        }
        router.refresh();
        showUndo(said, async () => {
            const back = await runAction(
                () => updateService(service.id, whoPatch(next, was)),
                { quiet: true },
            );
            if (!back) return { ok: false, error: UNREACHED };
            if (back.ok) {
                onSet(was);
                router.refresh();
            }
            return back;
        });
    }

    function setTakingWho(
        service: { id: string; name: string } & WhoFields,
        taking: boolean,
        onSet: (who: WhoFields) => void,
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
        onSet: (who: WhoFields) => void,
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
