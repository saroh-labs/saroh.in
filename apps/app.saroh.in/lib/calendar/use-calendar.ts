"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { useOrgId } from "@/lib/query/org";

import type { CalendarSpan } from "./queries";
import { calendarRead } from "./queries";

/**
 * The calendar's days for the open business (DEC-259). A new month or week
 * keeps the last one on screen (greyed by the container) until it arrives.
 */
export function useCalendar(span: CalendarSpan) {
    return useQuery({
        ...calendarRead.options(useOrgId(), span),
        placeholderData: keepPreviousData,
    });
}

/**
 * Try again on a layer that couldn't be read: the calendar's own read,
 * given by the container. Absent (a part rendered on its own), Try again
 * does what it did before.
 */
export const CalendarReadAgain = createContext<(() => void) | null>(null);

export function useCalendarReadAgain(): (() => void) | undefined {
    return useContext(CalendarReadAgain) ?? undefined;
}
