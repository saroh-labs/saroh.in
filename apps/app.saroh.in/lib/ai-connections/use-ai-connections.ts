"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { aiActivityRead, aiConnectionsRead } from "./queries";

/** AI assistants' connections (`settings` tier). */
export function useAiAppsScreen() {
    return useQuery(aiConnectionsRead.options(useOrgId(), {}));
}

/** What one connection changed here, its first page, when its sheet opens. */
export function useAiActivity(connection: string) {
    return useQuery(aiActivityRead.options(useOrgId(), { connection }));
}
