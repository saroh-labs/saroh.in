/**
 * Track stock (#515), as the product page and the editor show it — pure and
 * client-safe. The API decides; these only say what to draw and in what
 * words.
 *
 * A product counts stock while its own switch (`stockTracked`) and the
 * business's are both on. Untracked, it has no count and sells unless a
 * storefront marks it sold out by hand — then that storefront refuses new
 * orders for it until it is marked available again.
 */

/**
 * Whether the product counts stock. `business` is the business's switch,
 * `null` when it could not be read — then the product's own switch decides,
 * as it does for every business that never turned it off.
 */
export function countsStock(
    productTracked: boolean,
    business: boolean | null,
): boolean {
    return productTracked && business !== false;
}

/**
 * What a person sees of the Track stock switch:
 * - "change" — Owner and Admin (`store:write`) turn it on and off;
 * - "locked" — a stock-only role (`inventory:write` alone) sees it, locked,
 *   with why: it changes how the product sells, not how many there are;
 * - "hidden" — anyone else sees no switch, only whether it is tracked.
 */
export type TrackingControl = "change" | "locked" | "hidden";

export function trackingControl(may: {
    canWrite: boolean;
    canStock: boolean;
}): TrackingControl {
    if (may.canWrite) return "change";
    return may.canStock ? "locked" : "hidden";
}

/** Track stock as one screen draws it. */
export interface ProductTracking {
    /** The product counts stock now (its switch and the business's). */
    counts: boolean;
    /** The business's switch; off, no product can start tracking. */
    business: boolean;
    control: TrackingControl;
}

/** Why a stock-only role can't flip the switch. */
export const TRACKING_LOCKED =
    "Only an owner or admin can turn Track stock on or off.";

/** The business has Track stock off: no product counts. */
export const BUSINESS_NOT_TRACKING =
    "Your business doesn't track stock, so products sell with no count unless you mark them sold out.";

/** Said once it is off. */
export const TRACKING_OFF_SAID = "Stock is no longer tracked for this product.";

/** Said once it is on again, and what that means for the shop. */
export const TRACKING_ON_SAID = "Stock is tracked for this product again.";
export const TRACKING_ON_NEXT =
    "It starts at 0, so the shop says Sold out until you count it.";

/** Said when it couldn't go off, above the API's reason. */
export const TRACKING_STILL_ON = "Stock is still tracked";

/** The confirmation before it goes off: what it does to the count and the shop. */
export function stopTrackingConfirm(productName: string): {
    title: string;
    description: string;
    confirmLabel: string;
} {
    return {
        title: `Stop tracking ${productName}?`,
        description:
            "Its count goes to 0 at every storefront, and it sells without a count unless you mark it sold out. Turning it back on starts from 0, so you count it again.",
        confirmLabel: "Stop tracking",
    };
}

// ---- Sold out by hand (#515) ----

/** One storefront that sells the product, and whether it is marked Sold out. */
export interface SoldOutPlace {
    storefrontId: string;
    name: string;
    soldOut: boolean;
}

/**
 * Who sees the Mark sold out action: anyone who may count and move stock
 * (Owner, Admin, and a stock-only role). Everyone else sees the state only.
 */
export function canMarkSoldOut(may: { canStock: boolean }): boolean {
    return may.canStock;
}

/** The untracked card's line under "Not tracked". */
export function untrackedLine(places: readonly SoldOutPlace[]): string {
    const out = places.filter((p) => p.soldOut);
    if (out.length === 0) return "Available on the shop.";
    if (places.length <= 1 || out.length === places.length) {
        return "Sold out — marked by hand";
    }
    return `Sold out at ${listNames(out.map((p) => p.name))} — marked by hand`;
}

/**
 * The editor's note for an untracked product: no count, sells unless it is
 * marked sold out, and what turning tracking back on does.
 */
export const UNTRACKED_NOTE =
    "Not tracked. This product has no count and sells unless you mark it sold out. Use it for things made to order. Turning tracking back on starts from a count of 0, so count it first.";

/** The one-line note elsewhere (the variant drawer, the checklist). */
export function untrackedShort(places: readonly SoldOutPlace[]): string {
    const line = untrackedLine(places);
    if (line === "Available on the shop.") {
        return "Not tracked — sells unless you mark it sold out.";
    }
    const said = line.replace(" — marked by hand", ", marked by hand");
    return `Not tracked — ${said.charAt(0).toLowerCase()}${said.slice(1)}.`;
}

/**
 * The product page's Details row for an untracked product: "Not tracked ·
 * always available", or — agreeing with the Stock card beside it — "Not
 * tracked · sold out, marked by hand" ("… sold out at Online, marked by
 * hand" when only some storefronts are).
 */
export function untrackedDetail(places: readonly SoldOutPlace[]): string {
    const line = untrackedLine(places);
    if (line === "Available on the shop.") {
        return "Not tracked · always available";
    }
    const said = line.replace(" — marked by hand", ", marked by hand");
    return `Not tracked · ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}

/** The action's label for one storefront. */
export function soldOutAction(soldOut: boolean): string {
    return soldOut ? "Mark available" : "Mark sold out";
}

/** Said once it is done: "Marked sold out at Hill Road." */
export function soldOutSaid(storefront: string, soldOut: boolean): string {
    return soldOut
        ? `Marked sold out at ${storefront}.`
        : `Available again at ${storefront}.`;
}

/** Said above the API's reason when it couldn't be changed. */
export function soldOutFailed(soldOut: boolean): string {
    return soldOut ? "Not marked sold out" : "Still marked sold out";
}

/** "a, b and c" */
function listNames(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
