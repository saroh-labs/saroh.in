/**
 * A location's logo (DEC-123): its own when it has one, else the
 * business's, else none. Pure — what the read says and what a save writes;
 * `LocationLogoService` does the reading and the library checks.
 *
 * Receipts and invoices never read this: they print the business logo
 * (DEC-082).
 */

/** A location's own logo: where it is served, and its library image. */
export interface OwnLogo {
    url: string;
    /** Null for one that was typed in as an address, before uploads. */
    mediaId: string | null;
}

export interface LocationLogos {
    /** The location's own, or null when it uses the business's. */
    ownLogo: OwnLogo | null;
    /** The business logo (Settings › Business), or null when it has none. */
    businessLogo: { url: string } | null;
    /** The one to show for this location, and whose it is. */
    effectiveLogo: { url: string; from: "location" | "business" } | null;
}

export function locationLogos(
    store: { logo: string | null; logoMediaId: string | null },
    businessLogoUrl: string | null,
): LocationLogos {
    const own = store.logo?.trim();
    const business = businessLogoUrl?.trim();
    const ownLogo = own ? { url: own, mediaId: store.logoMediaId } : null;
    const businessLogo = business ? { url: business } : null;
    return {
        ownLogo,
        businessLogo,
        effectiveLogo: ownLogo
            ? { url: ownLogo.url, from: "location" }
            : businessLogo
              ? { url: businessLogo.url, from: "business" }
              : null,
    };
}

/** What a save writes to the two columns; `null` leaves them as they are. */
export interface LogoPatch {
    logo: string | null;
    logoMediaId: string | null;
}

/** What an older app is told when it sends a new logo address. */
export const LOGO_ADDRESS_GONE_MESSAGE =
    "A logo is uploaded now, not linked. Upload it under Description and logo.";

/**
 * What the old `logo` address field still does, for an app that sends it
 * with every save: nothing when it repeats what is stored, and an empty
 * one takes off a logo that was itself an address. It never takes off an
 * uploaded logo (only `logoMediaId: null` does), and a new address is
 * refused (`"refused"`): a logo is uploaded now.
 */
export function legacyLogoPatch(
    sent: string | null | undefined,
    current: { logo: string | null; logoMediaId: string | null },
): LogoPatch | null | "refused" {
    if (sent === undefined) return null;
    const address = sent?.trim() ?? "";
    if (address === (current.logo ?? "")) return null;
    if (address) return "refused";
    return current.logoMediaId ? null : { logo: null, logoMediaId: null };
}
