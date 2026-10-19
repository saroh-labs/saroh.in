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
    takingToast,
    whoPatch,
} from "@/lib/services/service-cards";

/**
 * The "Taking bookings" switch (Bookings audit, 12 Oct 2026): one way to
 * pause a service or take bookings for it again, from its row and from its
 * own page. It acts as it is flipped and asks nothing, since it can be put
 * back: the toast says what happened and offers Undo. Pausing takes a
 * service off the booking page and keeps every booking already made.
 *
 * `onSet` is how the caller draws it: called with the new state at once,
 * with the old one again if the save didn't go through, and with the old
 * one when Undo puts it back.
 *
 * Two ways in. `setTaking` moves the service's status (the editor's
 * switch, until U16). `setTakingWho` is the Services list's (U15,
 * DEC-170 Q5): off unticks both "Who can book it" boxes, so nobody can
 * book it and bookings already made stay; on ticks both back. Undo puts
 * back exactly the boxes it had.
 */
export function useTakingBookings() {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    const write = (id: string, taking: boolean) =>
        updateService(id, { status: taking ? "ACTIVE" : "ARCHIVED" });

    async function setTaking(
        service: { id: string; name: string },
        taking: boolean,
        onSet: (taking: boolean) => void,
    ) {
        onSet(taking);
        const res = await runAction(() => write(service.id, taking), {
            setBusy: (on) => setBusy(on ? service.id : null),
        });
        if (!res?.ok) {
            // The switch was flipped before its save: put it back.
            onSet(!taking);
            if (res) showError(res.error);
            return;
        }
        router.refresh();
        showUndo(takingToast(service.name, !taking), async () => {
            const back = await runAction(() => write(service.id, !taking), {
                quiet: true,
            });
            if (!back) return { ok: false, error: UNREACHED };
            if (back.ok) {
                onSet(!taking);
                router.refresh();
            }
            return back;
        });
    }

    async function setTakingWho(
        service: { id: string; name: string } & WhoFields,
        taking: boolean,
        onSet: (who: WhoFields) => void,
    ) {
        const was: WhoFields = {
            status: service.status,
            showOnBookingPage: service.showOnBookingPage,
            bookableByTeam: service.bookableByTeam,
        };
        const patch = takingPatch(taking);
        const next: WhoFields = { ...was, ...patch };
        onSet(next);
        const res = await runAction(() => updateService(service.id, patch), {
            setBusy: (on) => setBusy(on ? service.id : null),
        });
        if (!res?.ok) {
            onSet(was);
            if (res) showError(res.error);
            return;
        }
        router.refresh();
        showUndo(pauseToast(service.name, taking), async () => {
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

    return {
        /** The id of the service whose switch is saving, or null. */
        busy,
        setTaking,
        setTakingWho,
    };
}
