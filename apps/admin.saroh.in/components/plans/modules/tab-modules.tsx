"use client";

import { TabPlaceholder } from "../tab-placeholder";

/**
 * The Modules tab: all modules (plans catalogue U8). U6 leaves this slot; U8 replaces it.
 *
 * A tab takes no props. It reads:
 * - `usePlans()` — the server's picture (`pricing`), `coupons`, `access`
 *   (`canEdit`, `canPublish`, `canManageCoupons`), `siteUrl` and `me`;
 * - `useDraft()` — `catalog` to draw, `edit(fn)` to change it (the first
 *   edit starts the draft; it autosaves), `check`, `impact`, `flush()`;
 * - `usePlansNav()` — `setTab(tab, focus?)` and the `focus` it was opened on;
 * - `useFlash()` — the one-line confirmation at the foot of the screen.
 * Writes go through `@/lib/pricing-actions`.
 */
export function TabModules() {
    return <TabPlaceholder name="All modules" />;
}
