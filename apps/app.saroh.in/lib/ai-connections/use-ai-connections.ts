"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { aiConnectionsRead } from "./queries";

/** AI assistants' connections (`settings` tier). */
export function useAiAppsScreen() {
    return useQuery(aiConnectionsRead.options(useOrgId(), {}));
}
