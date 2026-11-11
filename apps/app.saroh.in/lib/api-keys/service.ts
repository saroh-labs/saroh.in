import type {
    ApiKeyList,
    ApiKeyView,
    ApiUsageView,
    CreateApiKeyBody,
    CreatedApiKey,
} from "@saroh/api-contract";
import { cache } from "react";

import type { CrmResult } from "@/lib/api/http";
import { getJson, mutate, orgBase } from "@/lib/api/http";

/**
 * Settings › API and AI apps › Connections (API keys) and Usage:
 * `organizations/:org/api-keys` and `/api-usage`. Server-only. A failed
 * read throws to the tab's `error.tsx`; a 403 is `forbidden()`.
 */

/** The business's keys, newest first; revoked and expired ones left out. */
export async function listApiKeys(now = new Date()): Promise<ApiKeyView[]> {
    const base = await orgBase();
    if (!base) return [];
    const list = await getJson<ApiKeyList>(`${base}/api-keys`);
    return (list?.data ?? []).filter((k) => keyWorks(k, now));
}

/** Works now: not revoked, not expired, not past a roll's 24 hours. */
export function keyWorks(key: ApiKeyView, now: Date): boolean {
    const past = (iso: string | null) =>
        iso !== null && new Date(iso).getTime() <= now.getTime();
    return !key.revokedAt && !past(key.expiresAt) && !past(key.graceUntil);
}

/** This minute's calls, the caps, and whether keys and webhooks are open. Once a request. */
export const readApiUsage = cache(async (): Promise<ApiUsageView | null> => {
    const base = await orgBase();
    if (!base) return null;
    return getJson<ApiUsageView>(`${base}/api-usage`);
});

export function createApiKey(
    body: CreateApiKeyBody,
): Promise<CrmResult<CreatedApiKey>> {
    return mutate(
        "/api-keys",
        "POST",
        body,
        "We couldn't make that key. Try again.",
    );
}

export function rollApiKey(id: string): Promise<CrmResult<CreatedApiKey>> {
    return mutate(
        `/api-keys/${encodeURIComponent(id)}/roll`,
        "POST",
        {},
        "We couldn't replace that key. Try again.",
    );
}

export function revokeApiKey(id: string): Promise<CrmResult<ApiKeyView>> {
    return mutate(
        `/api-keys/${encodeURIComponent(id)}/revoke`,
        "POST",
        {},
        "We couldn't revoke that key. Try again.",
    );
}
