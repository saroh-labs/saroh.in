"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import { revalidatePath } from "next/cache";

import { voidInvoice as voidInvoiceApi } from "@/lib/invoices/service";

import type { AutopayChargeTiming } from "./autopay-timing";
import type { PlanValues } from "./plan-drafts";
import * as drafts from "./plan-drafts";
import type { PauseChoice, SubscribeInput } from "./service";
import * as api from "./service";

/** Thin: the API decides who may, and what a subscription may become. */

function refresh() {
    // "layout", so each subscription's and each plan's own page is refreshed
    // with the list and its Plans tab.
    for (const [path, type] of [
        ["/billing/subscriptions", "layout"],
        ["/billing/plans", "layout"],
        ["/billing/invoices", undefined],
    ] as const) {
        // rq-revalidate-ok: reached only by a write without orgId, from a server-rendered screen (a plan's page, a person's page, the Plan Editor).
        revalidatePath(path, type);
    }
}

async function then<T extends { ok: boolean }>(res: Promise<T>): Promise<T> {
    const r = await res;
    if (r.ok) refresh();
    return r;
}

/**
 * A write from Subscriptions' React Query screens names the tab's business
 * (`orgId`, `useSubscriptionSave`): refused when another is open, and
 * nothing revalidated, since the screen reads its own queries again.
 * Without it (a plan's page, a person's page) the pages are revalidated as
 * before.
 */
function write<T extends { ok: boolean }>(
    orgId: string | undefined,
    call: () => Promise<T>,
) {
    return orgId ? writeAsOrg(orgId, call) : then(call());
}

export async function subscribe(input: SubscribeInput, orgId?: string) {
    return write(orgId, () => api.subscribe(input));
}
export async function pauseSubscription(
    id: string,
    choice: PauseChoice,
    orgId?: string,
) {
    return write(orgId, () => api.pauseSubscription(id, choice));
}
/** "Members can pause from their account" (A8). */
export async function setMembersCanPause(on: boolean, orgId?: string) {
    return write(orgId, () => api.setMembersCanPause(on));
}
/** "When autopay charges", for the business (D13B). */
export async function setAutopayChargeTiming(
    timing: AutopayChargeTiming,
    orgId?: string,
) {
    return write(orgId, () => api.setAutopayChargeTiming(timing));
}
/** A plan's own "When autopay charges" (D13B); null: the business's. */
export async function setPlanChargeTiming(
    planId: string,
    timing: AutopayChargeTiming | null,
    orgId?: string,
) {
    return write(orgId, () => api.setPlanChargeTiming(planId, timing));
}
/**
 * Retry a failed renewal: a new payment link (F4's Retry by payment link), or a new
 * charge on their autopay (D13).
 */
export async function retrySubscription(
    id: string,
    via: api.RetryVia = "PAY_LINK",
    orgId?: string,
) {
    // From Home or Subscriptions on React Query (DEC-259): each reads itself again.
    return write(orgId, () => api.retrySubscription(id, via));
}
/**
 * "Send a set-up link" (D14): the provider's page to approve autopay on,
 * answered once; emailed as well when asked and the business can.
 */
export async function sendAutopayLink(
    id: string,
    method: api.AutopayMethod,
    email: boolean,
    orgId?: string,
) {
    return write(orgId, () => api.sendAutopayLink(id, method, email));
}
/** "Cancel autopay" (D14): the subscription carries on, invoiced by link. */
export async function cancelAutopay(id: string, orgId?: string) {
    return write(orgId, () => api.cancelAutopay(id));
}
export async function resumeSubscription(id: string, orgId?: string) {
    return write(orgId, () => api.resumeSubscription(id));
}
export async function keepSubscription(id: string, orgId?: string) {
    return write(orgId, () => api.keepSubscription(id));
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
    orgId?: string,
) {
    if (orgId) {
        return writeAsOrg(orgId, () => cancelThenVoid(id, when, voidInvoiceId));
    }
    const res = await cancelThenVoid(id, when, voidInvoiceId);
    // A cancel that went through is revalidated, whatever the void did.
    if (res.ok || res.error.startsWith(CANCELLED_BUT)) refresh();
    return res;
}

const CANCELLED_BUT = "Cancelled, but the invoice is still open";

async function cancelThenVoid(
    id: string,
    when: "now" | "periodEnd",
    voidInvoiceId?: string,
) {
    const res = await api.cancelSubscription(id, when);
    if (!res.ok || !voidInvoiceId) return res;
    const voided = await voidInvoiceApi(voidInvoiceId, "Membership cancelled");
    if (!voided.ok) {
        return {
            ok: false as const,
            error: `${CANCELLED_BUT}: ${voided.error}`,
        };
    }
    return res;
}

export async function skipCollection(id: string, date: string, orgId?: string) {
    return write(orgId, () => api.skipCollection(id, date));
}
export async function unskipCollection(
    id: string,
    date: string,
    orgId?: string,
) {
    return write(orgId, () => api.unskipCollection(id, date));
}
export async function changePlan(id: string, planId: string, orgId?: string) {
    return write(orgId, () => api.changePlan(id, planId));
}
export async function cancelPlanChange(id: string, orgId?: string) {
    return write(orgId, () => api.cancelPlanChange(id));
}

/** The next page of a subscription's Changes, older than `cursor` (D9). */
export async function loadSubscriptionEvents(id: string, cursor: string) {
    return api.listSubscriptionEvents(id, cursor);
}

/**
 * Archive, or sell again. The Plans tab's Undo calls it with the opposite,
 * so one action serves both ways (D3).
 */
export async function setPlanArchived(
    id: string,
    archived: boolean,
    orgId?: string,
) {
    return write(orgId, () => api.setPlanArchived(id, archived));
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
