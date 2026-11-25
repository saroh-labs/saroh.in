"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { askAiSettingsRead } from "./queries";

/** Settings › Ask AI (`settings` tier). */
export function useAskAiSettings() {
    return useQuery(askAiSettingsRead.options(useOrgId(), {}));
}
