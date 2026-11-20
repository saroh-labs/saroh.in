"use client";

import { useEffect, useState } from "react";

import { accountCalendars } from "@/lib/google-calendar/actions";
import type {
    CalendarAccount,
    GoogleCalendarOption,
} from "@/lib/google-calendar/types";

/**
 * One account's calendars from Google, read when its sheet opens. Until
 * Google answers (or if it can't), the ones Saroh already knows stand in,
 * so the sheet is never empty for a slow Google.
 */
export function useAccountCalendars(
    account: CalendarAccount | null,
    open: boolean,
): { options: GoogleCalendarOption[]; fromGoogle: boolean } {
    const [read, setRead] = useState<{
        id: string;
        list: GoogleCalendarOption[] | null;
    } | null>(null);
    const id = account?.id;
    useEffect(() => {
        if (!open || !id) return;
        let live = true;
        accountCalendars(id)
            .then((list) => {
                if (live) setRead({ id, list });
            })
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [open, id]);
    const list = read?.id === id ? read?.list : null;
    if (list) return { options: list, fromGoogle: true };
    return {
        options: (account?.calendars ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            primary: c.writeTo,
            canWrite: true,
        })),
        fromGoogle: false,
    };
}
