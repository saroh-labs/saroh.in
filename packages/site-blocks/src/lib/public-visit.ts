import type { OpeningHoursDay } from "./opening-hours";
import { isOpeningWeek } from "./opening-hours";

/**
 * The public visit read's shape (G8) and its check — kept out of the
 * `"use client"` Visit us block on purpose. saroh.app's booking page reads
 * the same place on the SERVER for its header (E6), and a function exported
 * from a client module is only a client reference there: calling it throws,
 * the read's catch turns that into null, and the header silently lost its
 * address, hours and phone on every site. `public-visit.test.ts` keeps this
 * file free of the directive.
 */

/** A place as the public visit read returns it (G8). */
export interface PublicVisit {
    /** `storefront` — a SHOP; `business` — the profile fallback (E6). */
    source: "storefront" | "business";
    storeId: string | null;
    name: string;
    address: string | null;
    phone: string | null;
    hours: OpeningHoursDay[] | null;
    /** The business's zone (DEC-033); India when none is set. */
    timezone: string;
    /**
     * Days (`YYYY-MM-DD` in the zone) the business is closed for the whole
     * of its hours (E3) — the list the hero's line reads (review G-2).
     * Optional: an API from before it read as no closures.
     */
    closedDates?: string[];
}

export function isPublicVisit(value: unknown): value is PublicVisit {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        (v.source === "storefront" || v.source === "business") &&
        (v.storeId === null || typeof v.storeId === "string") &&
        typeof v.name === "string" &&
        (v.address === null || typeof v.address === "string") &&
        (v.phone === null || typeof v.phone === "string") &&
        (v.hours === null || isOpeningWeek(v.hours)) &&
        typeof v.timezone === "string" &&
        (v.closedDates === undefined ||
            (Array.isArray(v.closedDates) &&
                v.closedDates.every((d) => typeof d === "string")))
    );
}
