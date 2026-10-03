"use client";

import { TabPlaceholder } from "../tab-placeholder";

/**
 * The Plans tab: plan by plan (plans catalogue U7). U6 leaves this slot; U7 replaces it.
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
export function TabPlans() {
    return <TabPlaceholder name="Plan by plan" />;
}
