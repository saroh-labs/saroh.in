"use server";

import { revalidatePath } from "next/cache";

import { refundPaymentAttempt } from "./service";

/**
 * Home's "Refund" on a payment taken at the wrong amount (PAY-06). Thin:
 * the API decides who may, and how much goes back.
 */
export async function refundMismatch(attemptId: string) {
    const res = await refundPaymentAttempt(attemptId);
    // Home reads it again next time, without the row.
    if (res.ok) revalidatePath("/");
    return res;
}
