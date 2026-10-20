"use server";

import type { InvoiceDetails } from "./details";
import { readInvoiceDetails } from "./details";

/*
 * Kept apart from `actions.ts`, which every invoice screen imports: this
 * one reads server-only modules, and only the list's details sheet calls it.
 */

/**
 * One invoice's details for the side sheet a list row opens (DEC-173, U9):
 * the same read the invoice's page makes, so the two show the same thing.
 * A read, so nothing is revalidated; a failure comes back as a message.
 */
export async function loadInvoiceDetails(
    id: string,
): Promise<{ ok: true; data: InvoiceDetails } | { ok: false; error: string }> {
    try {
        const details = await readInvoiceDetails(id);
        return details
            ? { ok: true, data: details }
            : { ok: false, error: "That invoice is not here any more." };
    } catch {
        return { ok: false, error: "That invoice could not be loaded." };
    }
}
