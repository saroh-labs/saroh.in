"use server";

import { revalidatePath } from "next/cache";

import type { DiscountInput } from "./service";
import {
    createDiscount as createDiscountApi,
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
