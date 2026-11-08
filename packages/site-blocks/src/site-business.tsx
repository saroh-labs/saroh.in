"use client";

import { createContext, useContext } from "react";

/**
 * The business a merchant page belongs to, as far as its forms care: its
 * country, and the facts its edition's profile gives (DEC-204 item 7), passed
 * in once by the site's layout from the read it does anyway. Every phone field
 * starts on the country and a delivery asks by `address`. Outside a site (a
 * preview, a test), India's, as every business was.
 *
 * The facts come in rather than from `@saroh/edition`: a block imports
 * nothing from the workspace but `@saroh/block-contract` (G1, #252). Each
 * union is the profile's own, which the layout's assignment holds them to.
 */
export type SiteAddress = "indian-state-and-pin" | "country-and-region";
export type SitePhoneNumbers = "indian" | "with-country-code";

export interface SiteBusiness {
    country: string | null;
    address: SiteAddress;
    phoneNumbers: SitePhoneNumbers;
    /** Its customers pay by UPI, so a page may name a UPI app. Absent: yes. */
    upi?: boolean;
    /** GST, or a tax line the business names itself. Absent: GST. */
    taxSystem?: "gst" | "named-line";
    /** The struck-through price: India's MRP, or an original price. Absent: MRP. */
    struckPrice?: "mrp" | "original-price";
    /** Whether customers may sign in with a phone (DEC-211). Absent: yes. */
    phoneSignIn?: boolean;
}

export const INDIA_SITE_BUSINESS: SiteBusiness = {
    country: null,
    address: "indian-state-and-pin",
    phoneNumbers: "indian",
};

/** The tax a price carries, as a word: "GST", or "tax" for a named line. */
export const taxWordOf = (business: SiteBusiness) =>
    (business.taxSystem ?? "gst") === "gst" ? "GST" : "tax";

/**
 * What the struck-through price is called: "MRP" in India, else
 * "Original price", or "Was" where it sits beside the price on a card.
 */
export function struckWordOf(business: SiteBusiness, short = false) {
    if ((business.struckPrice ?? "mrp") === "mrp") return "MRP";
    return short ? "Was" : "Original price";
}

const SiteBusinessContext = createContext<SiteBusiness>(INDIA_SITE_BUSINESS);

export const SiteBusinessProvider = SiteBusinessContext.Provider;

export const useSiteBusiness = () => useContext(SiteBusinessContext);
