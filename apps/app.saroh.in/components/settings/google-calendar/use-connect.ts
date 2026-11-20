"use client";

import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { connectGoogle } from "@/lib/google-calendar/actions";

/**
 * Connect, wherever it is offered (the page, Providers, Bookings): asks the
 * API for Google's consent address and goes there. Busy until the browser
 * leaves; a refusal is handed to `onFailed` to say.
 */
export function useConnect(onFailed: (error: string) => void) {
    const [busy, setBusy] = useState(false);
    async function go() {
        const res = await runAction(() => connectGoogle(), {
            setBusy,
            onUnreached: onFailed,
            quiet: true,
        });
        if (!res) return;
        if (!res.ok) return onFailed(res.error);
        setBusy(true);
        window.location.assign(res.data.url);
    }
    return { busy, go };
}
