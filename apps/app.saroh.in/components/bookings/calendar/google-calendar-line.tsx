"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
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

/** The one line's words; the whole pitch is its title. */
const GC_LINE = "Put your bookings on Google Calendar";

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
            className="shrink-0"
        />
    );
    // One line (DEC-234, BKVGoogle): a phone keeps the diary in sight.
    const LINE =
        "flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-card py-0.5 pl-3 pr-0.5 text-[13px]";
    if (line.kind === "lapsed") {
        return (
            <div
                data-google-calendar-line=""
                className={cn(LINE, "border-warning/40")}
            >
                <CalendarDays
                    aria-hidden
                    className="size-4 shrink-0 text-warning"
                />
                <p className="m-0 min-w-0 flex-1 truncate">
                    Google stopped Saroh&apos;s access to {line.email}
                </p>
                <TextLink
                    data-ph-unmask=""
                    href={GOOGLE_CALENDAR_HREF}
                    className="shrink-0 font-semibold coarse:min-h-11"
                >
                    Manage
                </TextLink>
                {close}
            </div>
        );
    }
    return (
        <div data-google-calendar-line="" className={LINE}>
            <CalendarDays
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
            />
            <p
                data-ph-unmask=""
                title={GC_PITCH}
                className="m-0 min-w-0 flex-1 truncate"
            >
                {GC_LINE}
            </p>
            <Button
                type="button"
                size="sm"
                variant="link"
                disabled={busy}
                aria-label={busy ? undefined : GC_WORDS.connect}
                onClick={() => void go()}
                className="shrink-0 font-semibold coarse:min-h-11"
            >
                {busy ? GC_WORDS.connecting : "Connect"}
            </Button>
            {close}
        </div>
    );
}
