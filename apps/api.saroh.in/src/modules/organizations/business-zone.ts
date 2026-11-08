import type { Edition } from "@saroh/edition";
import { editionProfile, zoneInCountry } from "@saroh/edition";
import { IANAZone } from "luxon";

/**
 * The business's zone when it is one the tz database knows, else its
 * edition's default (India's own, UTC on Global). Every reader that falls
 * back for a business falls back here, never to another country's zone.
 */
export function zoneOf(
    zone: string | null | undefined,
    edition: Edition | null | undefined,
): string {
    const own = zone?.trim();
    return own && IANAZone.isValidZone(own)
        ? own
        : editionProfile(edition).defaultZone;
}

/**
 * The zone a new business starts with (UX-008, KTD-C): its country's when
 * that country keeps one (India's for an Indian business, wherever its owner
 * signs up from); for a country that keeps several, the one setup sent only
 * when it is in that country, else the country's main zone (owner, 8 Nov
 * 2026); else the edition's default. A zone from another country, such as an
 * owner's browser abroad, is never used.
 */
export function startingZone(
    sent: string | null | undefined,
    country: string | null | undefined,
    edition: Edition | null | undefined,
): string {
    // India's setup is India-only: no country said is India's.
    const said = country?.trim() ?? "";
    const code =
        said !== ""
            ? said
            : editionProfile(edition).businessCountry === "india-only"
              ? "IN"
              : "";
    return zoneInCountry(code, sent) ?? editionProfile(edition).defaultZone;
}
