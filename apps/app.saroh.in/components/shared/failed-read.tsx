"use client";

import type { StateSize } from "@saroh/ui/data-state";
import { FailedState } from "@saroh/ui/data-state";
import {
    couldntLoad,
    nothingChanged,
    TRY_AGAIN,
} from "@saroh/ui/lib/state-copy";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A part of a page the server couldn't read, with a Try again that reads it
 * again (UX audit, 10 Oct 2026). Eleven such parts told the merchant to
 * reload the browser, which throws away whatever else they had open on the
 * page. This asks the server for the page's reads again (`router.refresh()`)
 * and leaves the rest of the screen where it was.
 *
 * `inline` (the default) is one line for a row, a card's body or a sheet
 * section: "Couldn't load the waitlist. Try again". `panel` and `page` are
 * the failed card. For a read a component made itself, pass `onRetry`.
 */
export function FailedRead({
    things,
    reassurance,
    size = "inline",
    onRetry,
    className,
}: {
    /** What couldn't be read: "the waitlist", "roles". */
    things: string;
    /** One true sentence about what that leaves as it was. */
    reassurance?: string;
    size?: StateSize;
    /** Reads again, when the read isn't the page's own. */
    onRetry?: () => void;
    className?: string;
}) {
    const retry = useRefresh();
    return (
        <FailedState
            size={size}
            className={className}
            title={couldntLoad(things)}
            description={
                size === "inline"
                    ? (reassurance ?? null)
                    : nothingChanged(reassurance)
            }
            onRetry={onRetry ?? retry.run}
            retrying={onRetry ? false : retry.pending}
        />
    );
}

/**
 * Try again for a notice that says what is missing (`PartialNotice`): the
 * same read-again, as the notice's text action.
 */
export function TryAgainLink({ className }: { className?: string }) {
    const retry = useRefresh();
    return (
        <button
            type="button"
            onClick={retry.run}
            disabled={retry.pending}
            className={
                className ??
                "wk-press shrink-0 rounded-sm font-medium underline underline-offset-[3px] hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
            }
        >
            {TRY_AGAIN}
        </button>
    );
}

/** Asks the server for this page's reads again, without leaving it. */
function useRefresh() {
    const router = useRouter();
    const [pending, start] = useTransition();
    return { pending, run: () => start(() => router.refresh()) };
}
