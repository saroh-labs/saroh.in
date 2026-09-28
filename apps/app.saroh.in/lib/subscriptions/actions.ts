"use server";

import { revalidatePath } from "next/cache";

import { voidInvoice as voidInvoiceApi } from "@/lib/invoices/service";

import type { PlanValues } from "./plan-drafts";
import * as drafts from "./plan-drafts";
import type { PauseChoice, PlanInput, SubscribeInput } from "./service";
import * as api from "./service";

/** Thin: the API decides who may, and what a subscription may become. */

function refresh() {
    // "layout", so each subscription's and each plan's own page is refreshed
    // with the list and its Plans tab.
    revalidatePath("/billing/subscriptions", "layout");
    revalidatePath("/billing/plans", "layout");
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
export async function pauseSubscription(id: string, choice: PauseChoice) {
    return then(api.pauseSubscription(id, choice));
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

export async function skipCollection(id: string, date: string) {
    return then(api.skipCollection(id, date));
}
export async function unskipCollection(id: string, date: string) {
    return then(api.unskipCollection(id, date));
}
export async function changePlan(id: string, planId: string) {
    return then(api.changePlan(id, planId));
}
export async function cancelPlanChange(id: string) {
    return then(api.cancelPlanChange(id));
}

/** The next page of a subscription's Changes, older than `cursor` (D9). */
export async function loadSubscriptionEvents(id: string, cursor: string) {
    return api.listSubscriptionEvents(id, cursor);
}

export async function createPlan(input: PlanInput) {
    return then(api.createPlan(input));
}
export async function updatePlan(id: string, input: PlanInput) {
    return then(api.updatePlan(id, input));
}
/**
 * Archive, or sell again. The Plans tab's Undo calls it with the opposite,
 * so one action serves both ways (D3).
 */
export async function setPlanArchived(id: string, archived: boolean) {
    return then(api.setPlanArchived(id, archived));
}

/**
 * An older page of a plan's history, for History's "Show earlier" (D4). A
 * read, so nothing is refreshed; a failure is said where the button was.
 */
export async function loadPlanEvents(planId: string, cursor: string) {
    return api.listPlanEvents(planId, cursor);
}

// — The Plan Editor (D5 → D7): the editor shell's adapter calls these. ———
// Each write refreshes the Plans tab and Plan Detail, which show a draft and
// "Unpublished changes"; the read refreshes nothing.

/** Read a plan for the editor, and again for Reload after a conflict. */
export async function loadPlanDraft(id: string) {
    return drafts.loadPlanDraft(id);
}
export async function createPlanDraft(values: Partial<PlanValues>) {
    return then(drafts.createPlanDraft(values));
}
export async function savePlanDraft(
    id: string,
    values: Partial<PlanValues>,
    revision: number,
) {
    return then(drafts.savePlanDraft(id, values, revision));
}
export async function publishPlan(id: string, revision: number) {
    return then(drafts.publishPlan(id, revision));
}
export async function discardPlanChanges(id: string, revision: number) {
    return then(drafts.discardPlanChanges(id, revision));
}
export async function deletePlanDraft(id: string, revision: number) {
    return then(drafts.deletePlanDraft(id, revision));
}
