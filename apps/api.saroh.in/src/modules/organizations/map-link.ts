import { mapLinkOrNull, normaliseMapLink } from "@saroh/block-contract";

/**
 * An address's place on Google Maps (DEC-128): what "Get directions" opens
 * on the business's website. Kept beside the address it is the map of, a
 * location's (`StoreSettings.mapUrl`) or the registered one
 * (`BusinessProfile.registeredAddressMapUrl`). It is not a social link.
 *
 * The rule is `@saroh/block-contract`'s (`normaliseMapLink`), shared with
 * the workspace and the site: only Google's own map pages, each rebuilt
 * into one canonical address, never a redirect and never another site.
 */

/**
 * What was sent, as it is stored: absent leaves it, "" or null clears it,
 * anything else is its canonical address or the reason it can't be. Pure;
 * each save names its own field when it refuses.
 */
export function mapLinkWrite(
    sent: string | null | undefined,
): { leave: true } | { url: string | null } | { problem: string } {
    if (sent === undefined) return { leave: true };
    const typed = (sent ?? "").trim();
    if (typed === "") return { url: null };
    const check = normaliseMapLink(typed);
    return check.ok ? { url: check.url } : { problem: check.problem };
}

/** A stored link as anyone may read it: re-checked, never trusted. */
export function mapLinkRead(stored: string | null | undefined): string | null {
    return mapLinkOrNull(stored);
}
