import type {
    SiteContact,
    SiteContactPlace,
} from "@/lib/organizations/settings-service";

/**
 * The words of Website › Settings › Contact and social (DEC-125): what
 * each row says the website shows of how to reach the business, and what
 * the address sheet says about where that address comes from. Pure.
 */

/** What a row says when nothing is set, and what the site then leaves out. */
export const CONTACT_EMPTY = {
    phone: "None. Your website shows no Call link.",
    email: "None. Your website shows no email.",
    address: "None. Your website shows no address.",
    social: "None yet",
} as const;

/** Said under the group's title. */
export const CONTACT_LEAD =
    "What your website shows in its footer. A change shows on your website straight away, with no publish.";

/** Said to someone who may change the site but not the business. */
export const CONTACT_OWNER_ONLY =
    "These are your business's own details. An owner or admin can change them.";

/** Said when what the site shows couldn't be read. */
export const CONTACT_UNREAD = {
    title: "Couldn't load your contact details",
    description: "Nothing has been changed. Your website still shows them.",
};

/** An address on one line. */
export function addressLine(address: string): string {
    return address
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(", ");
}

/**
 * The address row's lines: one place is its address, several are each
 * named, and the registered address says that it is.
 */
export function addressRowLines(places: readonly SiteContactPlace[]): string[] {
    if (places.length === 1 && places[0]) {
        const only = places[0];
        return [
            only.source === "registered"
                ? `${addressLine(only.address)} · your registered address`
                : addressLine(only.address),
        ];
    }
    return places.map((p) =>
        p.name
            ? `${p.name}: ${addressLine(p.address)}`
            : addressLine(p.address),
    );
}

/** Where the address the site shows comes from. */
export type AddressSource = "locations" | "registered" | "none";

export function addressSourceOf(contact: SiteContact): AddressSource {
    if (contact.places.some((p) => p.source === "location")) return "locations";
    return contact.places.length > 0 ? "registered" : "none";
}

/** The address sheet's words. */
export const ADDRESS_SHEET = {
    title: "Address on your website",
    description: "Where customers can find you.",
    fromLocations:
        "Your website shows the address of each location customers visit. A location with no counter never shows its address.",
    readOnly: "Your role can read these addresses but not change them.",
    noAddress: "No address yet. Your website shows none for it.",
    directionsOwn: "Get directions opens your Google Maps link.",
    directionsSearch: "Get directions searches for this address.",
    noLocation:
        "An address shows on your website once a location customers visit has one. You have none yet.",
    switchLabel: "Show your registered address",
    switchNote:
        "The address printed on your invoices. Leave this off if it is your home.",
    registeredMissing:
        "You haven't added a registered address yet, so nothing shows until you do.",
    whileLocations:
        "Your registered address isn't shown while a location customers visit has an address.",
    mapLinkSaved: "Google Maps link saved. Get directions opens it now.",
} as const;

/** What saving the choice says. */
export function addressSavedWords(shown: boolean): string {
    return shown
        ? "Your website shows your registered address now"
        : "Your website no longer shows your registered address";
}
