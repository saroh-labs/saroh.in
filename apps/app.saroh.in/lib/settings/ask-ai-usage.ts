import type { AskAiPeopleUsage, AskAiSettings } from "@saroh/api-contract";

import { getJson, orgBase } from "@/lib/api/http";

/**
 * Settings › Ask AI's reads (Owner and Admin; the API checks
 * `module:manage`). Server-only. Counts only, never what anyone asked.
 */

async function read<T>(path: string): Promise<T | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<T>(`${base}/ask-ai${path}`);
}

/** The switch and this period's total, kept while the switch is off. */
export function getAskAiSettingsWithUsage(): Promise<AskAiSettings | null> {
    return read<AskAiSettings>("/settings");
}

/** Every member with their questions this period. */
export function getAskAiPeopleUsage(): Promise<AskAiPeopleUsage | null> {
    return read<AskAiPeopleUsage>("/usage/people");
}
