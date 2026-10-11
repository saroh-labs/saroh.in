import type { SocialNetwork } from "@saroh/block-contract";
import {
    mapLinkOrNull,
    normaliseSocialLink,
    SOCIAL_NETWORKS,
} from "@saroh/block-contract";

import type { OpeningHoursDay } from "./opening-hours";
import { isOpeningWeek } from "./opening-hours";

/**
 * The public contact read's shape (DEC-128) and its check: how to reach a
 * business, as its website shows it.
 *
 *   GET ${apiUrl}/public/sites/:siteId/contact
 *
 * Kept free of `"use client"`, as `public-visit.ts` is: saroh.app reads it
 * on the server for the footer and the home page's structured data.
 */
export interface PublicContact {
    /** The business's public phone, E.164; null draws no Call link. */
    phone: string | null;
    /** Its contact email; null draws none. */
    email: string | null;
    /** Where customers come. Empty: no address is drawn. */
    places: PublicContactPlace[];
    /** Its social links, in the networks' order. */
    social: PublicSocialLink[];
}

export interface PublicContactPlace {
    /** `location`: a place customers visit; `registered`: the owner's choice. */
    source: "location" | "registered";
    /** The location's name; null for the registered address. */
    name: string | null;
    /** Lines joined by "\n". */
    address: string;
    hours: OpeningHoursDay[] | null;
    /**
     * The address's own place on Google Maps, which "Get directions" opens;
     * null: a search for the address.
     */
    mapUrl: string | null;
}

export interface PublicSocialLink {
    network: SocialNetwork;
    url: string;
}

/** Nothing set: no group is drawn. */
export const NO_CONTACT: PublicContact = {
    phone: null,
    email: null,
    places: [],
    social: [],
};

/**
 * A place, or null when it isn't one. Its map link is kept only while it
 * is Google's own canonical address (checked here as well as by the API);
 * anything else reads as no link, and directions search for the address.
 */
function placeOf(value: unknown): PublicContactPlace | null {
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;
    if (
        !(v.source === "location" || v.source === "registered") ||
        !(v.name === null || typeof v.name === "string") ||
        typeof v.address !== "string" ||
        v.address.trim() === "" ||
        !(v.hours === null || isOpeningWeek(v.hours))
    ) {
        return null;
    }
    return {
        source: v.source,
        name: v.name,
        address: v.address,
        hours: v.hours,
        mapUrl: mapLinkOrNull(v.mapUrl),
    };
}

/**
 * A link the page may draw: a known network whose address is already that
 * network's own canonical one. Checked here as well as by the API, so a
 * link that opens anywhere else can never be drawn, whatever was served.
 */
export function isSocialLink(value: unknown): value is PublicSocialLink {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    const network = SOCIAL_NETWORKS.find((n) => n === v.network);
    if (!network || typeof v.url !== "string") return false;
    const check = normaliseSocialLink(network, v.url);
    return check.ok && check.url === v.url;
}

/**
 * The answer, narrowed rather than cast (#264). A malformed place or link
 * is left out on its own; anything that isn't the shape at all is null.
 */
export function publicContactOf(body: unknown): PublicContact | null {
    if (typeof body !== "object" || body === null) return null;
    const v = body as Record<string, unknown>;
    if (
        !(v.phone === null || typeof v.phone === "string") ||
        !(v.email === null || typeof v.email === "string") ||
        !Array.isArray(v.places) ||
        !Array.isArray(v.social)
    ) {
        return null;
    }
    return {
        phone: v.phone?.trim() ? v.phone.trim() : null,
        email: v.email?.trim() ? v.email.trim() : null,
        places: (v.places as unknown[]).flatMap((place) => {
            const read = placeOf(place);
            return read ? [read] : [];
        }),
        social: (v.social as unknown[]).filter(isSocialLink),
    };
}

/** Whether there is anything to draw. */
export function hasContact(contact: PublicContact | null | undefined): boolean {
    if (!contact) return false;
    return (
        contact.phone !== null ||
        contact.email !== null ||
        contact.places.length > 0 ||
        contact.social.length > 0
    );
}
