import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { GstPriceMode } from "@/lib/gst/price-mode";
import { businessModeOf, isGstPriceMode } from "@/lib/gst/price-mode";

import type { GstAsk } from "@/lib/gst/item-words";

import type { ChosenRate, MissingRates } from "./missing";
import { gstAskOf } from "./missing";
import type { OverMrpRead } from "./over-mrp";
import { overMrpOf } from "./over-mrp";

/**
 * The GST rates a business still has to choose (`missing.ts`), read from
 * and saved through api.saroh.in. Server-only.
 */

/**
 * Priced things on sale with no GST rate, and whether the business is
 * registered at all. Null when it couldn't be told (the API down, a role
 * that reads neither services nor products): the page then says nothing
 * and asks for nothing, and the API's own refusal still stands behind it.
 * Read with a bare fetch, so a 403 here is "couldn't tell", never the
 * page's own forbidden.
 *
 * One read per request: a page's notice and its dialogs' GST standing
 * (`readGstAsk`) share it.
 */
export const readMissingRates = cache(readMissing);

/**
 * Whether the business is asked for GST (registered), and its own way of
 * carrying it: what an editor or a desk dialog needs to know of the
 * business. Unread asks for nothing.
 */
export async function readGstAsk(): Promise<GstAsk> {
    return gstAskOf(await readMissingRates());
}

async function readMissing(): Promise<MissingRates | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/gst-rates/missing`);
        if (!res.ok) return null;
        const body = (await res.json()) as Partial<MissingRates> | null;
        if (typeof body?.registered !== "boolean") return null;
        return {
            registered: body.registered,
            items: Array.isArray(body.items) ? body.items : [],
            more: body.more === true,
            // The read's own when it says, else the business's settings.
            priceMode: !body.registered
                ? null
                : isGstPriceMode(body.priceMode)
                  ? body.priceMode
                  : await readBusinessPriceMode(base),
        };
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}

/**
 * How a registered business's prices carry GST (12 Oct 2026), from its
 * settings. Null when it isn't registered or the settings couldn't be read
 * (the API down, a role without them): a screen then says neither way. A
 * bare fetch, so a 403 is "couldn't tell", never the page's own forbidden.
 */
async function readBusinessPriceMode(
    base: string,
): Promise<GstPriceMode | null> {
    try {
        const res = await apiFetch(`${base}/settings`);
        if (!res.ok) return null;
        const body = (await res.json()) as {
            tax?: { registered?: unknown; priceMode?: unknown };
        } | null;
        return body?.tax?.registered === true
            ? businessModeOf(body.tax.priceMode)
            : null;
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}

/**
 * The products (and options) that would cost more than their MRP with GST
 * added to the business's prices (`over-mrp.ts`): what the tax settings
 * say before a switch to "GST is added" is saved. Null when it couldn't be
 * told; the sheet then says nothing, and the API's own check on the save
 * still stands. A bare fetch, so a 403 is "couldn't tell".
 */
export async function readOverMrpIfAdded(): Promise<OverMrpRead | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/gst-rates/over-mrp?mode=ADDED`);
        if (!res.ok) return null;
        return overMrpOf(await res.json());
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}

/** Save a rate on each thing named: all of them, or none. */
export function setGstRates(
    items: readonly ChosenRate[],
): Promise<CrmResult<{ saved: number }>> {
    return mutate<{ saved: number }>(
        "/gst-rates",
        "PUT",
        { items },
        "Couldn't save the GST rate.",
    );
}
