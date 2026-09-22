"use server";

import { revalidatePath } from "next/cache";

import { voidInvoice as voidInvoiceApi } from "@/lib/invoices/service";

import type { PlanInput, SubscribeInput } from "./service";
import * as api from "./service";

/** Thin: the API decides who may, and what a subscription may become. */

function refresh() {
    revalidatePath("/billing/subscriptions");
    revalidatePath("/billing/plans");
    revalidatePath("/billing/invoices");
}

async function then<T extends { ok: boolean }>(res: Promise<T>): Promise<T> {
    const r = await res;
    if (r.ok) refresh();
    return r;
}

export async function subscribe(input: SubscribeInput) {
    return then(api.subscribe(input));
}
export async function pauseSubscription(id: string) {
    return then(api.pauseSubscription(id));
}
export async function resumeSubscription(id: string) {
    return then(api.resumeSubscription(id));
}
export async function keepSubscription(id: string) {
    return then(api.keepSubscription(id));
}

/**
 * Cancel, and — when asked — void the period's open invoice too. Two calls,
 * so the answer says which one failed: a cancel that went through with an
 * invoice left open is not the same as nothing happening.
 */
export async function cancelSubscription(
    id: string,
    when: "now" | "periodEnd",
    voidInvoiceId?: string,
) {
    const res = await api.cancelSubscription(id, when);
    if (!res.ok) return res;
    if (voidInvoiceId) {
        const voided = await voidInvoiceApi(
            voidInvoiceId,
            "Membership cancelled",
        );
        refresh();
        if (!voided.ok) {
            return {
                ok: false as const,
                error: `Cancelled, but the invoice is still open: ${voided.error}`,
            };
        }
        return res;
    }
    refresh();
    return res;
}

export async function createPlan(input: PlanInput) {
    return then(api.createPlan(input));
}
export async function updatePlan(id: string, input: PlanInput) {
    return then(api.updatePlan(id, input));
}
export async function setPlanArchived(id: string, archived: boolean) {
    return then(api.setPlanArchived(id, archived));
}
