/**
 * Reads sorted by how often their answer changes (owner, 25 Nov 2026). Every
 * `defineRead` names its tier; `pnpm check:query-keys` fails one that
 * doesn't. The API stays the boundary: a tier only decides how often the
 * browser asks.
 *
 * - `settings`: changed by someone in Settings, rarely (modules, plan,
 *   the shell's answers). Read once per full load, kept for the visit,
 *   read again when a save that changes it says so (`afterSettingsSave`,
 *   which tells the other tabs), when the API refuses something (a 403
 *   marks them stale, `onReadError`), and quietly every 10 minutes.
 * - `records`: what the team edits (products, customers, invoices, stock).
 *   Fresh for 5 minutes; their own saves invalidate what they changed.
 * - `live`: what customers and the outside world change (orders, bookings,
 *   Home, unread). Fresh for 30 seconds; the 45 s live refresh and coming
 *   back to the tab read them again (`useLiveRefresh`), so no timer here.
 */
export type Tier = "settings" | "records" | "live";

export const TIERS = ["settings", "records", "live"] as const;

/** The safety net for a setting changed where no save here could say so. */
export const SETTINGS_REFRESH_MS = 10 * 60_000;

interface Freshness {
    staleTime: number;
    gcTime?: number;
    refetchInterval?: number;
}

export const FRESHNESS: Readonly<Record<Tier, Freshness>> = {
    settings: {
        staleTime: Infinity,
        gcTime: Infinity,
        refetchInterval: SETTINGS_REFRESH_MS,
    },
    records: { staleTime: 5 * 60_000 },
    live: { staleTime: 30_000 },
};

/**
 * Whether a cached query is a read others change (`records` or `live`):
 * what coming back to the tab reads again on a React Query page not in
 * `LIVE_QUERY_ROUTES`. Settings are read again only when told.
 */
export function isChangingQuery(q: {
    meta?: Record<string, unknown>;
}): boolean {
    return q.meta?.tier === "records" || q.meta?.tier === "live";
}

/** Whether a cached query is a settings read (its `meta.tier`). */
export function isSettingsQuery(q: {
    meta?: Record<string, unknown>;
}): boolean {
    return q.meta?.tier === "settings";
}
