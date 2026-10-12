"use server";

import type { ChosenRate } from "./missing";
import { readMissingRates, setGstRates } from "./service";

/** Server Actions for the GST rates still to choose; the API authorizes each. */

/** Save a rate on each service or product named. */
export async function saveGstRates(items: ChosenRate[]) {
    return setGstRates(items);
}

/** What still has no rate, read again by a sheet that just saved some. */
export async function loadMissingRates() {
    return readMissingRates();
}
