"use client";

import { authClient } from "@saroh/auth/client";
import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";

/**
 * "Sign out and use {email}": for someone who opened an invitation while
 * signed in as another person. Signing out alone would drop them on a bare
 * sign-in page with the invitation lost, so this signs out and goes on to
 * `next`, which carries the invitation and the address it was sent to.
 *
 * `next` is the sign-in address for this invitation. Left out, it is the
 * accounts sign-in at `signInUrl` with this page as the way back, which only
 * the browser knows.
 */
export function SwitchAccountButton({
    label,
    next,
    signInUrl,
}: {
    label: string;
    next?: string;
    signInUrl: string;
}) {
    const [pending, setPending] = useState(false);

    async function switchAccount() {
        setPending(true);
        try {
            const { error } = await authClient.signOut();
            if (error) throw new Error("sign-out refused");
        } catch {
            setPending(false);
            showError("Couldn't sign you out. Try again.");
            return;
        }
        window.location.href =
            next ??
            `${signInUrl}?redirect=${encodeURIComponent(window.location.href)}`;
    }

    return (
        <Button
            variant="brand"
            onClick={() => void switchAccount()}
            busy={pending}
            busyLabel="Signing out…"
        >
            {label}
        </Button>
    );
}
