"use client";

import type { StateSize } from "@saroh/ui/data-state";
import { FailedState, PartialNotice } from "@saroh/ui/data-state";
import {
    couldntLoad,
    couldntLoadLine,
    nothingChanged,
    TRY_AGAIN,
} from "@saroh/ui/lib/state-copy";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
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
    return (
        <ReadAgain onRetry={onRetry}>
            {(retry) => (
                <FailedState
                    size={size}
                    className={className}
                    title={couldntLoad(things)}
                    description={
                        size === "inline"
                            ? (reassurance ?? null)
                            : nothingChanged(reassurance)
                    }
                    onRetry={retry.run}
                    retrying={retry.pending}
                />
            )}
        </ReadAgain>
    );
}

/**
 * What is missing from a page whose rest arrived, said above it (UX
 * audit, 10 Oct 2026): the partial banner in the one sentence, "Couldn't
 * load {things}.", then what that leaves the page unable to say (`so`),
 * and Try again. About twenty pages each worded this their own way
 * ("Reviews couldn't be read just now, so …", "… could not be loaded"),
 * and none offered to read again.
 *
 * `FailedRead` is for a part that is absent altogether (a card's body, a
 * row). This is for a page that is drawn, and is less than it looks. For
 * a read the component made itself, pass `onRetry`: refreshing the route
 * would not ask for it again.
 */
export function PartialRead({
    things,
    so,
    onRetry,
    className,
}: {
    /** What couldn't be read, as it sits after "Couldn't load": "reviews". */
    things: string;
    /** One true sentence: what the page can't say without it. */
    so?: string;
    /** Reads again, when the read isn't the page's own. */
    onRetry?: () => void;
    className?: string;
}) {
    return (
        <PartialNotice
            className={className}
            action={<TryAgainLink onRetry={onRetry} />}
        >
            {couldntLoadLine(things)}
            {so ? ` ${so}` : null}
        </PartialNotice>
    );
}

/**
 * Try again for a notice that says what is missing (`PartialNotice`): the
 * same read-again, as the notice's text action. `onRetry` for a read the
 * component made itself.
 */
export function TryAgainLink({
    className,
    onRetry,
}: {
    className?: string;
    onRetry?: () => void;
}) {
    return (
        <ReadAgain onRetry={onRetry}>
            {(retry) => (
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
            )}
        </ReadAgain>
    );
}

interface Retry {
    run: () => void;
    pending: boolean;
}

/**
 * The read-again a Try again runs: the caller's own, or, with none, the
 * page's reads (`router.refresh()`). Only the second asks for the router,
 * so a component with a read of its own (a popover, a picker, a sheet)
 * never depends on being inside a page.
 */
function ReadAgain({
    onRetry,
    children,
}: {
    onRetry?: () => void;
    children: (retry: Retry) => ReactNode;
}) {
    return onRetry ? (
        children({ run: onRetry, pending: false })
    ) : (
        <PageReadAgain>{children}</PageReadAgain>
    );
}

/** Asks the server for this page's reads again, without leaving it. */
function PageReadAgain({
    children,
}: {
    children: (retry: Retry) => ReactNode;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    return children({ pending, run: () => start(() => router.refresh()) });
}
