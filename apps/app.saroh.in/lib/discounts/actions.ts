"use server";

import { revalidatePath } from "next/cache";

import { reachOf, ruleOf } from "./describe";
import type { DiscountInput } from "./service";
import {
    createDiscount as createDiscountApi,
    listDiscounts as listDiscountsApi,
    updateDiscount as updateDiscountApi,
} from "./service";

/** Thin: the API decides who may change a code and what a code may be. */

export async function createDiscount(input: DiscountInput) {
    const res = await createDiscountApi(input);
    if (res.ok) revalidatePath("/commerce/discounts");
    return res;
}

export async function updateDiscount(id: string, input: DiscountInput) {
    const res = await updateDiscountApi(id, input);
    if (res.ok) revalidatePath("/commerce/discounts");
    return res;
}

/**
 * Live offers for a post's Offer card picker (W2): the codes running now,
 * as "20% off · everything". Null when the read failed, so the picker
 * says so rather than "No offers yet".
 */
export async function listOffersForPicker(): Promise<
    { id: string; name: string; rule: string }[] | null
> {
    try {
        const all = await listDiscountsApi();
        return all
            .filter((d) => d.state === "ACTIVE")
            .map((d) => ({
                id: d.id,
                // A blank description is no name: the code is.
                name: d.description?.trim() ? d.description.trim() : d.code,
                rule: `${ruleOf(d)} · ${reachOf(d)}`,
            }));
    } catch {
        return null;
    }
}
