"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { activityRead } from "./queries";

/** Settings › Activity's last changes (`records` tier). */
export function useActivityScreen() {
    return useQuery(activityRead.options(useOrgId(), {}));
}
