"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { webhookDeliveriesRead, webhooksRead } from "./queries";

/** Notifications to your systems' addresses (`settings` tier). */
export function useWebhooksScreen() {
    return useQuery(webhooksRead.options(useOrgId(), {}));
}

/**
 * One address's latest messages, read when its sheet opens on it and held
 * for the visit; its Test and Resend read them again.
 */
export function useWebhookDeliveries(endpoint: string) {
    return useQuery(webhookDeliveriesRead.options(useOrgId(), { endpoint }));
}
