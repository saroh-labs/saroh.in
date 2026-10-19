"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { useSyncExternalStore } from "react";

/*
 * The calendar's toolbar row, its view switch and its colour key became
 * header C (U2, #1018: `header/calendar-header.tsx`); the key is "What the
 * colours mean" in its "…" sheet. What stays here is the one-time hint
 * with nobody on the diary.
 */

// ── The one-time hint ───────────────────────────────────────────────────────

const HINT_KEY = "saroh:bookings:service-hours-hint";
const listeners = new Set<() => void>();
// Kept here too, so the hint stays away for the visit when the browser
// refuses storage (a private window, blocked site data).
let dismissedHere = false;

function wasDismissed(): boolean {
    if (dismissedHere) return true;
    try {
        return window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
        return false;
    }
}

function dismissHint() {
    dismissedHere = true;
    try {
        window.localStorage.setItem(HINT_KEY, "1");
    } catch {
        // Storage is full or blocked: it is gone for this visit all the same.
    }
    listeners.forEach((l) => l());
}

function subscribeHint(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * With nobody on the diary: how the one column works, said once. "Got it"
 * puts it away for good in this browser. The server never draws it (it
 * cannot know), so someone who dismissed it never sees it flash back; "Add
 * who takes bookings" stays at the head of the column either way.
 */
export function ServiceHoursHint({ onAdd }: { onAdd?: () => void }) {
    const dismissed = useSyncExternalStore(
        subscribeHint,
        wasDismissed,
        () => true,
    );
    if (dismissed) return null;
    return (
        <Notice
            tone="neutral"
            align="center"
            className="mb-3"
            action={
                <Button variant="outline" size="sm" onClick={dismissHint}>
                    Got it
                </Button>
            }
        >
            Customers book each service in its own hours. Hatched time is
            closed, and the rest is open to book.{" "}
            {onAdd ? (
                // Words, not a second control: the action is at the head of
                // the column just below, at a size a thumb can press.
                <>
                    To give each person a column of their own, press “Add who
                    takes bookings” under Service hours.
                </>
            ) : null}
        </Notice>
    );
}
