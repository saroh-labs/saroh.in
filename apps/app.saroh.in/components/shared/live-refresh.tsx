"use client";

import { setErrorAction } from "@saroh/ui/toast";
import { useEffect } from "react";

import { accountsLoginUrl } from "@/lib/accounts";
import { SIGNED_OUT } from "@/lib/api/unreached";

import { useLiveRefresh, useUnreadTitle } from "./use-live-refresh";

/**
 * What the shell keeps running on every page (10 Oct 2026), drawing
 * nothing:
 *
 * - the page reads again by itself (`useLiveRefresh`);
 * - the unread count sits in the tab's title (`useUnreadTitle`);
 * - "You've been signed out…" gets its "Sign in" button wherever a save
 *   says it. Accounts opens in a new tab, so this page and what was typed
 *   on it are still here to send again.
 */
export function LiveRefresh({
    unread,
}: {
    /** The bell's count, or null for someone with no inbox. */
    unread: number | null;
}) {
    useLiveRefresh();
    useUnreadTitle(unread);
    useEffect(
        () =>
            setErrorAction(SIGNED_OUT, {
                label: "Sign in",
                onClick: () => {
                    window.open(accountsLoginUrl, "_blank", "noopener");
                },
            }),
        [],
    );
    return null;
}
