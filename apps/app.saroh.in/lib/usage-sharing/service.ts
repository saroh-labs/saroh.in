import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { UsageSharing } from "./sharing";

/**
 * The signed-in person's "Help improve Saroh" choice (DEC-125), kept by the
 * API on their user row. Server-only: forwards the session cookie through
 * the shared HTTP plumbing, as every workspace read does.
 */

/**
 * Their choice, or `null` when it could not be read. Never throws and never
 * calls `forbidden()`: the shell reads it on every page, and a failed read
 * must only mean "don't record", never a broken page.
 */
export async function usageSharingOrNull(): Promise<UsageSharing | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/me/usage-sharing`);
        if (!res.ok) return null;
        const data = (await res.json()) as {
            sharesUsage?: unknown;
            noticeSeenAt?: unknown;
        } | null;
        const value = data?.sharesUsage;
        if (typeof value !== "boolean" && value !== null) return null;
        // An API from before the notice says nothing: read as not seen, so
        // the notice shows rather than a recording starting untold.
        const seen = data?.noticeSeenAt;
        return {
            sharesUsage: value,
            noticeSeenAt: typeof seen === "string" && seen ? seen : null,
        };
    } catch {
        return null;
    }
}

/** Save their choice; the API answers with what is now kept. */
export function updateUsageSharing(
    sharesUsage: boolean,
): Promise<CrmResult<UsageSharing>> {
    return mutate<UsageSharing>(
        "/me/usage-sharing",
        "PATCH",
        { sharesUsage },
        "Couldn't save that choice",
    );
}

/** They dismissed the one-time notice; the API keeps when, once. */
export function markUsageNoticeSeen(): Promise<CrmResult<UsageSharing>> {
    return mutate<UsageSharing>(
        "/me/usage-sharing/notice-seen",
        "POST",
        {},
        "Couldn't save that",
    );
}
