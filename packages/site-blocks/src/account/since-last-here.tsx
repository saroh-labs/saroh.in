"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import type { AccountChange } from "./details-model";
import { changeWhen, changeWords, sinceWords } from "./details-model";
import { AccountCard, textLink } from "./parts";

/**
 * "Since you were last here", at the top of Home when something changed
 * (DEC-142): an order moved a step, a booking the business moved or
 * cancelled, a new message, an invoice to pay. One line each, newest first,
 * each leading to the thing. The business is named, never the person on
 * its team.
 *
 * Each line's day ("Today", "Yesterday", "9 Oct") is the visitor's own,
 * so it is written once the browser knows its zone, not on the server.
 * A read that failed says so in one quiet line: it never reads as "nothing
 * changed".
 */

/** The visitor's own zone, once in the browser; null while on the server. */
function useVisitorZone(): string | null {
    return useSyncExternalStore(
        () => () => undefined,
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        () => null,
    );
}

export function SinceLastHere({
    changes,
    since = null,
    failed = false,
    businessName,
    messagesHref,
    now,
    className,
}: {
    changes: AccountChange[];
    /** The visit the changes count from, said beside the title. */
    since?: string | null;
    /** The read failed: said, never shown as "nothing changed". */
    failed?: boolean;
    businessName: string;
    /** The account's Messages tab; null when this business has none. */
    messagesHref: string | null;
    /** The time the page was drawn, so the words don't shift on hydration. */
    now: string;
    className?: string;
}) {
    const zone = useVisitorZone();
    if (failed) {
        return (
            <p
                role="status"
                className={`text-site-body text-[14px] ${className ?? ""}`}
            >
                We couldn't check what changed since your last visit. Refresh
                the page to try again.
            </p>
        );
    }
    if (changes.length === 0) return null;
    const at = new Date(now);
    return (
        <AccountCard
            labelledBy="account-changes"
            title="Since you were last here"
            sub={zone ? sinceWords(since, at, zone) || undefined : undefined}
            className={className}
        >
            <ul className="m-0 list-none p-0">
                {changes.map((change, i) => {
                    const words = changeWords(
                        change,
                        businessName,
                        messagesHref,
                    );
                    return (
                        <li
                            key={`${change.kind}-${change.at}-${i}`}
                            className="border-site-border mt-3 flex items-baseline gap-3 border-t pt-3"
                        >
                            <span className="text-site-fg min-w-0 flex-1 text-[15px] font-semibold leading-snug">
                                {words.href ? (
                                    <Link
                                        href={words.href}
                                        className={textLink}
                                    >
                                        {words.text}
                                    </Link>
                                ) : (
                                    words.text
                                )}
                            </span>
                            <span className="text-site-body shrink-0 text-[13px] tabular-nums">
                                {zone ? changeWhen(change.at, at, zone) : ""}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </AccountCard>
    );
}
