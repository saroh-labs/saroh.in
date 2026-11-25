"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { webhooksRead } from "./queries";

/** Notifications to your systems' addresses (`settings` tier). */
export function useWebhooksScreen() {
    return useQuery(webhooksRead.options(useOrgId(), {}));
}
