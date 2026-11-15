"use server";

import { revalidatePath } from "next/cache";

import type { WebAddressAvailability, WebAddressRead } from "./web-address";
import type { ChangeWebAddressResult } from "./web-address-service";
import {
    changeWebAddress as changeWebAddressApi,
    readWebAddress,
    webAddressAvailability,
} from "./web-address-service";

/**
 * What the Change dialog calls (DEC-069, L4). Thin: who may change the
 * address, what is free and what a change holds are all the API's.
 */

/** The address and who may change it, for the Turn on sheet's Website field. */
export async function readWebAddressAction(): Promise<WebAddressRead> {
    return readWebAddress();
}

/** Whether `address` is free to this business; null when it can't be asked. */
export async function checkWebAddress(
    address: string,
): Promise<WebAddressAvailability | null> {
    return webAddressAvailability(address);
}

/**
 * Move the business to `address`. The workspace shows the address in more
 * than Settings (the site's settings, share links), so the layout is
 * revalidated too.
 */
export async function saveWebAddress(
    address: string,
): Promise<ChangeWebAddressResult> {
    const result = await changeWebAddressApi(address);
    if (result.ok) {
        revalidatePath("/settings/organization");
        revalidatePath("/", "layout");
    }
    return result;
}
