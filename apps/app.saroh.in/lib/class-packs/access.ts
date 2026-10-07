import { permits } from "@/lib/organizations/permits";
import type { resolveActiveOrganization } from "@/lib/organizations/service";

type Org = Awaited<ReturnType<typeof resolveActiveOrganization>>;

/**
 * The pack powers, as the API asks them (DEC-039, E26):
 *
 * - `pack:read` — the whole pack, prices and sales included;
 * - `pack:sell` — sell one at the desk, and pay for a booking with one;
 * - `pack:write` — make and change packs: prices, validity, publishing,
 *   extending, archiving.
 *
 * The API sends each person's resolved powers, so `pack:write` arrives with
 * `pack:sell` and `pack:read`. An API from before E26 doesn't know
 * `pack:sell` and asked `pack:write` to sell, so selling still accepts it.
 * Only the role's permissions decide, never its name (DEC-098): a pack's
 * prices are money.
 */
function holds(organization: Org, ...actions: string[]): boolean {
    return actions.some((a) => permits(organization, a));
}

/** The same answer the API gives: `pack:read`. */
export function canReadPacks(organization: Org): boolean {
    return holds(organization, "pack:read");
}

/** `pack:write` — make, change, publish, extend and archive packs. */
export function canWritePacks(organization: Org): boolean {
    return holds(organization, "pack:write");
}

/**
 * `pack:sell` — sell a pack at the desk, and spend or give back a holder's
 * class on a booking (which also takes `booking:write`).
 */
export function canSellPacks(organization: Org): boolean {
    return holds(organization, "pack:sell", "pack:write");
}

/**
 * Pay for a booking with a pack, or take the pack off it: `pack:sell` and
 * `booking:write` together, as the API asks, since it spends a class and
 * changes what the booking says about payment.
 */
export function canUsePacksOnBookings(organization: Org): boolean {
    return canSellPacks(organization) && holds(organization, "booking:write");
}
