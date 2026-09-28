import { formatList } from "./needs";
import type { HomeStaff } from "./service";

/**
 * The staff landing (round 2, F11), in words. A Member, Front desk or
 * Dentist lands on Home narrowed to the storefronts they work on, and the
 * header says so — "Friday 18 September · Rye & Co. · Hill Road only" —
 * because there is no switch on Home to widen it (design). Pure, so it is
 * tested without a page.
 */

/**
 * "Hill Road only", "Hill Road and Online only", or null when the Home
 * covers every storefront — no storefront role, or a role on all of them.
 */
export function storesOnly(staff: HomeStaff | null | undefined): string | null {
    const names = (staff?.stores ?? [])
        .map((store) => store.name.trim())
        .filter((name) => name.length > 0);
    if (names.length === 0) return null;
    return `${formatList(names)} only`;
}
