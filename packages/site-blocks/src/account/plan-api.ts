import type { AutopayMethod, AutopayStart } from "../autopay/api";
import type { TestReleaseRefusal } from "../test-release/words";
import type { AccountPlanTab } from "./model";

/**
 * What the Plan tab asks of the site's server (round-2 plan A, A8): its
 * server actions, handed in, since the page never calls the API itself.
 * Each answers in the member's words, never the API's own text.
 */

export type PlanChangeResult =
    | { ok: true; message: string; tab: AccountPlanTab }
    | { ok: false; message: string }
    | TestReleaseRefusal;

export type PayNowResult =
    | { ok: true; url: string }
    | { ok: false; message: string }
    | TestReleaseRefusal;

export interface PlanApi {
    pause: (ref: string, weeks: number) => Promise<PlanChangeResult>;
    resume: (ref: string) => Promise<PlanChangeResult>;
    cancel: (ref: string) => Promise<PlanChangeResult>;
    /** A fresh pay link for the plan's overdue invoice, made now. */
    payNow: (ref: string) => Promise<PayNowResult>;
    /**
     * Turn autopay on, or change how it pays (D12), with the method picked.
     * Absent: the site can't, and My plan offers none.
     */
    startAutopay?: (
        ref: string,
        method: AutopayMethod,
        idempotencyKey: string,
    ) => Promise<AutopayStartResult>;
}

export type AutopayStartResult =
    | { ok: true; data: AutopayStart }
    | { ok: false; message: string }
    | TestReleaseRefusal;

/** Said when the site's server couldn't be reached. */
export const PLAN_OFFLINE =
    "We couldn't reach the business. Try again in a moment.";
