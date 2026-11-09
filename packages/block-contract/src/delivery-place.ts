import {
    addressRulesFor,
    checkPostcode,
    checkRegion,
} from "@saroh/edition/address-rules";

import { PHONE_COUNTRIES } from "./phone";

/**
 * Where a Global business's delivery goes, past the city: its region and
 * country. An order keeps them apart, the region in `Order.deliveryState` and
 * the ISO code in `Order.deliveryCountry` (DEC-207), and prints them as one
 * line, "Texas, United States". India's orders hold the GST state alone and
 * no country, so their line is the state as it was.
 */

/** Longest region typed. */
export const REGION_MAX = 60;
/** Longest postcode a Global business's delivery takes. */
export const POSTCODE_MAX = 12;

/** A listed country by its ISO code ("gb" or "GB"), else null. */
export const listedCountry = (code: string | null | undefined) =>
    PHONE_COUNTRIES.find((c) => c.code === code?.trim().toUpperCase()) ?? null;

/** The printed line: "Texas, United States", "United States" or "Texas". */
export function joinDeliveryPlace(
    region: string | null | undefined,
    country: string | null | undefined,
): string {
    return [region?.trim() ?? "", listedCountry(country)?.name ?? ""]
        .filter(Boolean)
        .join(", ");
}

/** A typed or older stored line apart; `country` is null when it names none. */
export function splitDeliveryPlace(stored: string | null | undefined): {
    region: string;
    country: string | null;
} {
    const line = stored?.trim() ?? "";
    const at = line.lastIndexOf(",");
    const last = line
        .slice(at + 1)
        .trim()
        .toLowerCase();
    const country = PHONE_COUNTRIES.find((c) => c.name.toLowerCase() === last);
    return country
        ? {
              region: at < 0 ? "" : line.slice(0, at).trim(),
              country: country.code,
          }
        : { region: line, country: null };
}

/**
 * A Global delivery's region and postcode, held to the address's own country
 * and never refused for being abroad (owner, 8 Nov). Where the region is a
 * list (the US, Canada, Australia) a courier needs both, so both are asked;
 * elsewhere both are optional, but a typed postcode must fit its country.
 * The API holds an order to this; the app and the site say it sooner.
 */
export function checkDeliveryPlace(
    country: string | null | undefined,
    region: string | null | undefined,
    postcode: string | null | undefined,
):
    | { region: string; postcode: string }
    | { problem: string; field: "state" | "postalCode" } {
    const rule = addressRulesFor(country).region;
    const required = rule.kind === "list";
    if (required && !region?.trim()) {
        return {
            problem: `Choose the ${rule.label.toLowerCase()}.`,
            field: "state",
        };
    }
    const r = checkRegion(country, region, required);
    if ("problem" in r) return { problem: r.problem, field: "state" };
    const p = checkPostcode(country, postcode, required);
    if ("problem" in p) return { problem: p.problem, field: "postalCode" };
    return { region: r.value, postcode: p.value };
}
