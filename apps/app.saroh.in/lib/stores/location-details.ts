/**
 * A location's description and logo, as The place says them in one row
 * ("Description and logo · Description added · using your business logo ·
 * Edit"). They are edited in the row's sheet (`storefrontDetailsHref`
 * opens it); the row only says what is saved. Pure.
 *
 * A location uses the business logo unless it has its own (DEC-123).
 */

/** A location's own logo: where it is served, and its library image. */
export interface LocationLogo {
    url: string;
    /** Null for one typed in as an address, before a logo was uploaded. */
    mediaId: string | null;
}

export interface LocationDetails {
    description: string | null;
    /** Its own logo; `null` while it uses the business's. */
    logo: LocationLogo | null;
    /** The business logo's address; `null` when the business has none. */
    businessLogo: string | null;
}

/** The description's limit, the API's own (`UpdateStoreDto`). */
export const DESCRIPTION_MAX = 500;

/** Which logo a location shows: its own, the business's, or none. */
export type LogoSource = "own" | "business" | "none";

export function logoSource(
    details: Pick<LocationDetails, "logo" | "businessLogo">,
): LogoSource {
    if (details.logo) return "own";
    return details.businessLogo ? "business" : "none";
}

/** The picture to show for the location, whoever's it is; or null. */
export function shownLogo(
    details: Pick<LocationDetails, "logo" | "businessLogo">,
): string | null {
    return details.logo?.url ?? details.businessLogo;
}

/** What the sheet says about the logo in its draft. */
export const LOGO_STATE: Record<LogoSource, string> = {
    own: "This location has its own logo",
    business: "Using your business logo",
    none: "No logo yet",
};

/**
 * The row's sentence: what is there first, then what is still to add. "Own
 * logo · no description yet", never a "logo added" that leaves out whose.
 */
export function detailsSummary(details: LocationDetails): string {
    const described = Boolean(details.description?.trim());
    const logo = logoSource(details);
    if (described) {
        const second: Record<LogoSource, string> = {
            own: "own logo",
            business: "using your business logo",
            none: "no logo yet",
        };
        return `Description added · ${second[logo]}`;
    }
    if (logo === "own") return "Own logo · no description yet";
    if (logo === "business") {
        return "Using your business logo · no description yet";
    }
    return "No description yet · no logo yet";
}

/** Whether there is nothing to show at all, for the row's quieter wording. */
export function detailsEmpty(details: LocationDetails): boolean {
    return !details.description?.trim() && logoSource(details) === "none";
}

/** What `GET /stores/:id` says of the description and the logos. */
export interface StoreLogos {
    description?: string | null;
    /** The stored address alone, from an API before DEC-123. */
    logo?: string | null;
    ownLogo?: LocationLogo | null;
    businessLogo?: { url: string } | null;
}

/**
 * The read as the row and its sheet hold it. An API that doesn't send the
 * logos yet still has the address, which is the location's own.
 */
export function detailsOf(store: StoreLogos): LocationDetails {
    const typed = store.logo?.trim();
    const own =
        store.ownLogo === undefined
            ? typed
                ? { url: typed, mediaId: null }
                : null
            : store.ownLogo;
    return {
        description: store.description ?? null,
        logo: own,
        businessLogo: store.businessLogo?.url ?? null,
    };
}
