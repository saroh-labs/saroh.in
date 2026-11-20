"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { showError } from "@saroh/ui/toast";
import { CalendarDays, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useConnect } from "@/components/settings/google-calendar/use-connect";
import type { bookingsCalendarLine } from "@/lib/google-calendar/words";
import {
    GC_PITCH,
    GC_WORDS,
    GOOGLE_CALENDAR_HREF,
} from "@/lib/google-calendar/words";

type Line = NonNullable<ReturnType<typeof bookingsCalendarLine>>;

// Put away per person, in this browser, as the first day's help is.
const listeners = new Set<() => void>();
/** This visit's, for a browser whose storage refused it. */
const putAway = new Set<string>();

const keyOf = (line: Line, userId: string) =>
    `saroh:bookings:google-calendar:${line.kind}:${userId}`;

function wasDismissed(key: string): boolean {
    if (putAway.has(key)) return true;
    try {
        return window.localStorage.getItem(key) === "1";
    } catch {
        return false;
    }
}

function dismiss(key: string) {
    putAway.add(key);
    try {
        window.localStorage.setItem(key, "1");
    } catch {
        // Storage is full or blocked: it is gone for this visit all the same.
    }
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Bookings' one line about the person's own Google Calendar (20 Nov 2026):
 * Connect, straight to Google, for someone who could and hasn't; a lapsed
 * account, with Manage, for someone who has. Either is put away with ×,
 * for this person. The server never draws it (it can't know it was put
 * away), so it never flashes back.
 */
export function GoogleCalendarLine({
    line,
    userId,
}: {
    line: Line;
    userId: string;
}) {
    const key = keyOf(line, userId);
    const dismissed = useSyncExternalStore(
        subscribe,
        () => wasDismissed(key),
        () => true,
    );
    const { busy, go } = useConnect((error) => showError(error));
    if (dismissed) return null;

    const close = (
        <IconButton
            label="Dismiss"
            icon={<X />}
            variant="ghost"
            onClick={() => dismiss(key)}
        />
    );
    if (line.kind === "lapsed") {
        return (
            <Notice
                tone="warning"
                align="center"
                data-google-calendar-line=""
                action={
                    <>
                        <TextLink
                            data-ph-unmask=""
                            href={GOOGLE_CALENDAR_HREF}
                            className="font-semibold coarse:min-h-11"
                        >
                            Manage
                        </TextLink>
                        {close}
                    </>
                }
            >
                <p className="text-pretty">
                    Google stopped Saroh&apos;s access to {line.email}, so your
                    bookings don&apos;t reach it.
                </p>
            </Notice>
        );
    }
    return (
        <Notice
            tone="info"
            align="center"
            data-google-calendar-line=""
            icon={<CalendarDays />}
            action={
                <>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={busy ? undefined : GC_WORDS.connect}
                        onClick={() => void go()}
                    >
                        {busy ? GC_WORDS.connecting : "Connect"}
                    </Button>
                    {close}
                </>
            }
        >
            <p className="text-pretty">{GC_PITCH}</p>
        </Notice>
    );
}
