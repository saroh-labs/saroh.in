import { ApiError } from "@/lib/api/errors";
import { apiFetch, getList, orgBase } from "@/lib/api/http";

import type {
    NotAvailableYet,
    PlanUsage,
    SarohInvoice,
    SarohPlan,
    SarohSubscription,
} from "./plan";
import { NOT_AVAILABLE_YET } from "./plan";

/**
 * What Saroh charges this business, read from api.saroh.in (S7-005).
 * Server-only, through `lib/api/http.ts`.
 *
 * Two reads are real and two are seams. A seam returns `not-available` today
 * and documents the endpoint the backend will add; the page renders its
 * layout with honest words in the meantime, so filling one in is a change to
 * the function here and nothing on the page.
 */

/** The offerable catalogue, cheapest first. Global: any signed-in person. */
export function listSarohPlans(): Promise<SarohPlan[]> {
    return getList<SarohPlan>("/billing/plans");
}

export type SarohSubscriptionRead =
    | { status: "ok"; subscription: SarohSubscription | null }
    | { status: "denied" };

/**
 * This business's subscription, or null when it has none — which is most of
 * them today, since Saroh has not switched billing on.
 *
 * `billing:read` (Owner and Admin). A 403 is a role decision and comes back
 * as `denied`; any other failure throws to the segment boundary. The API
 * answers "no subscription" with an empty 200, not JSON `null`.
 */
export async function getSarohSubscription(): Promise<SarohSubscriptionRead> {
    const base = await orgBase();
    if (!base) return { status: "ok", subscription: null };
    const res = await apiFetch(`${base}/billing/subscription`);
    if (res.status === 403) return { status: "denied" };
    if (!res.ok) throw new ApiError(res.status, "GET billing/subscription");
    const text = await res.text();
    return {
        status: "ok",
        subscription: text
            ? (JSON.parse(text) as SarohSubscription | null)
            : null,
    };
}

/**
 * SEAM — invoices Saroh has billed this business. Nothing keeps them yet:
 * the billing webhook records the provider's events, not an invoice.
 *
 * Expected: `GET /organizations/:organizationId/billing/invoices`
 * (`billing:read`) → `SarohInvoice[]`, newest first:
 * `{ id, number, issuedAt, amountCents, currency, status: "PAID" | "DUE" |
 * "VOID", pdfUrl }`, with `pdfUrl` a short-lived signed link.
 */
export function listSarohInvoices(): Promise<
    { status: "ok"; invoices: SarohInvoice[] } | NotAvailableYet
> {
    return Promise.resolve(NOT_AVAILABLE_YET);
}

/**
 * SEAM — the line under "Your plan" in the design: what Saroh did for the
 * business last month ("sent 214 receipts and 38 invoices, took ₹1,82,400").
 * No such rollup exists, so nothing is shown in its place but a line saying so.
 *
 * Expected: `GET /organizations/:organizationId/billing/usage?period=last-month`
 * (`billing:read`) → `{ receipts: number, invoices: number,
 * paymentsCents: number, currency: string, periodStart, periodEnd }`.
 */
export function getPlanUsage(): Promise<
    { status: "ok"; usage: PlanUsage } | NotAvailableYet
> {
    return Promise.resolve(NOT_AVAILABLE_YET);
}

/**
 * SEAM — whether "Change plan" can act. `POST …/billing/subscribe
 * { planKey, provider }` exists, but a paid plan needs the owner to authorise
 * a mandate at the provider first, and the API returns no checkout step for
 * that. Until it does, the buttons are shown and off.
 *
 * Expected: `POST /organizations/:organizationId/billing/subscribe
 * { planKey }` (`billing:manage`) → `{ subscription }` for a free plan, or
 * `{ checkoutUrl }` for a paid one, with the provider chosen server-side.
 */
export function canChangePlanHere(): boolean {
    return false;
}
