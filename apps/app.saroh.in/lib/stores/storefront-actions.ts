"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { StorefrontInput } from "./storefronts";
import {
    closeStorefront as closeStorefrontApi,
    dismissLateRuleNotice as dismissLateRuleNoticeApi,
    updateStorefront as updateStorefrontApi,
} from "./storefronts";

/**
 * Server Actions for Sell → Storefronts.
 *
 * Thin: the API decides who may change or close a storefront and refuses
 * otherwise. From Sell › Locations (React Query, DEC-259) each takes the
 * tab's business last (`writeAsOrg`, refusing a moved tab) and revalidates
 * nothing: the screen reads its own queries again. Without it (Settings ›
 * Business hours, the website's address sheet, both server-rendered) a
 * save revalidates the whole layout, as the storefront pickers name them.
 */

export async function updateStorefront(
    storeId: string,
    input: StorefrontInput,
    orgId?: string,
) {
    if (orgId) {
        return writeAsOrg(orgId, () => updateStorefrontApi(storeId, input));
    }
    const res = await updateStorefrontApi(storeId, input);
    // rq-revalidate-ok: only from the server-rendered callers above.
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function closeStorefront(storeId: string, orgId: string) {
    return writeAsOrg(orgId, () => closeStorefrontApi(storeId));
}

/** Put Orders' one-time late notice away for a storefront (B17). */
export async function dismissLateRuleNotice(storeId: string) {
    const res = await dismissLateRuleNoticeApi(storeId);
    // rq-revalidate-ok: Orders' late notice, which hides itself; not Locations'.
    if (res.ok) revalidatePath("/commerce/orders");
    return res;
}
