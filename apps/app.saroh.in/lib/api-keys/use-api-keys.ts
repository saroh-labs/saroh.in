"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { apiKeysRead, apiUsageRead } from "./queries";

/** Connections' keys, masked (`settings` tier). */
export function useKeysScreen() {
    return useQuery(apiKeysRead.options(useOrgId(), {}));
}

/** Usage's minute (`live` tier). */
export function useUsageScreen() {
    return useQuery(apiUsageRead.options(useOrgId(), {}));
}
