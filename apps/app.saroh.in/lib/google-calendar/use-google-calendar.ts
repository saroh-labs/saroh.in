"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { googleCalendarRead } from "./queries";

/** Settings › Google Calendar, held for the visit (`settings` tier). */
export function useGoogleCalendarScreen() {
    return useQuery(googleCalendarRead.options(useOrgId(), {}));
}
