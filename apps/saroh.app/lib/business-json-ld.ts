import type { PublicContact } from "@saroh/site-blocks";
import { hasContact } from "@saroh/site-blocks";

import { jsonLdScript } from "./product-json-ld";

/**
 * The home page's structured data about the business (DEC-125): who it is
 * and how to reach it, in the words search engines read. Built only from
 * the public contact read, so it says exactly what the footer shows and
 * nothing more: no account's email, no registered address the owner didn't
 * choose, nothing about Saroh.
 *
 * - With one place customers come to it is a `LocalBusiness` with that
 *   address; with several, an `Organization` listing each as a `location`;
 *   with none, an `Organization`.
 * - `sameAs` is the business's profiles on other networks. A WhatsApp link
 *   is a way to message, not a profile, and the Google Maps link is the
 *   place's map (`hasMap`), so neither is in it.
 * - Only what is set is written. With nothing set there is no script.
 */

const SCHEMA = "https://schema.org";

export interface BusinessJsonLdInput {
    /** The site's name, which is what the header shows. */
    name: string;
    /** `https://<host>`. */
    origin: string;
    contact: PublicContact;
}

/** An address as one line; the place's own lines, comma-joined. */
function oneLine(address: string): string {
    return address
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(", ");
}

const postalAddress = (address: string) => ({
    "@type": "PostalAddress",
    streetAddress: oneLine(address),
});

export function businessJsonLd({
    name,
    origin,
    contact,
}: BusinessJsonLdInput): Record<string, unknown> | null {
    if (!hasContact(contact)) return null;
    const { phone, email, places, social } = contact;
    const sameAs = social
        .filter((s) => s.network !== "whatsapp" && s.network !== "googleMaps")
        .map((s) => s.url);
    const map = social.find((s) => s.network === "googleMaps")?.url;
    const one = places.length === 1 ? places[0] : undefined;
    return {
        "@context": SCHEMA,
        "@type": one ? "LocalBusiness" : "Organization",
        name,
        url: `${origin}/`,
        ...(phone ? { telephone: phone } : {}),
        ...(email ? { email } : {}),
        ...(one ? { address: postalAddress(one.address) } : {}),
        ...(one && map ? { hasMap: map } : {}),
        ...(places.length > 1
            ? {
                  location: places.map((place) => ({
                      "@type": "Place",
                      ...(place.name ? { name: place.name } : {}),
                      address: postalAddress(place.address),
                  })),
              }
            : {}),
        ...(sameAs.length > 0 ? { sameAs } : {}),
    };
}

/** The script's text, or null when there is nothing to say. */
export function businessJsonLdScript(
    input: BusinessJsonLdInput,
): string | null {
    const data = businessJsonLd(input);
    return data ? jsonLdScript(data) : null;
}
