"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { updateService } from "@/lib/services/actions";
import { takingToast } from "@/lib/services/service-cards";

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

    return {
        /** The id of the service whose switch is saving, or null. */
        busy,
        setTaking,
    };
}
