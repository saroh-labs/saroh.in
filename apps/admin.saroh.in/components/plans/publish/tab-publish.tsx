"use client";

import { TabPlaceholder } from "../tab-placeholder";

/**
 * The Review & publish tab (plans catalogue U10). U6 leaves this slot; U10 replaces it.
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
export function TabPublish() {
    return <TabPlaceholder name="Review & publish" />;
}
