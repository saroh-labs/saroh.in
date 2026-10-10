import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { MomentKey } from "./keys";
import { MOMENT_KEYS } from "./keys";

/**
 * Which moments the business has seen (wave G), kept by the API for the
 * whole business, so a moment put away on one device is gone on every one.
 * Server-only: `orgBase` reads the active-business cookie.
 */

/**
 * The moments already seen. Null when it can't be read (a failed read, an
 * older API, a role the API doesn't answer): a moment is a nicety, and one
 * that might be shown twice is not shown at all.
 */
export async function getSeenMoments(): Promise<Set<MomentKey> | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/moments`).catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json().catch(() => null)) as {
        seen?: unknown;
    } | null;
    if (!data || !Array.isArray(data.seen)) return null;
    const known = new Set<string>(MOMENT_KEYS);
    return new Set(
        data.seen.filter(
            (key): key is MomentKey =>
                typeof key === "string" && known.has(key),
        ),
    );
}

/** Put a moment away for the whole business. */
export async function markMomentSeen(
    key: MomentKey,
): Promise<CrmResult<{ seen: MomentKey[] }>> {
    return mutate(
        `/moments/${encodeURIComponent(key)}/seen`,
        "POST",
        {},
        "Could not put that away.",
    );
}
