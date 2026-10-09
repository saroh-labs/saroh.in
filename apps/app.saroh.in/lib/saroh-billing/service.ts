import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import { cache } from "react";

import { ApiError } from "@/lib/api/errors";
import { apiFetch, orgBase } from "@/lib/api/http";
import type { BillingAccessView } from "@/lib/billing/access";
import type { PausedView } from "@/lib/billing/paused";

import { cleanHandoff } from "./handoff";
import type { NotAvailableYet, PlanUsage, SarohSubscription } from "./plan";
import { NOT_AVAILABLE_YET } from "./plan";
import type {
    AddonsView,
    ChangeQuote,
    CheckoutsView,
    SarohInvoice,
} from "./plan-view";

/**
 * What Saroh charges this business, read from api.saroh.in (S7-005, plans
 * catalogue U12–U17). Server-only, through `lib/api/http.ts`. Writes are in
 * `./billing-actions.ts`.
 */

/** A read that a role may be refused: `denied` is a decision, not a failure. */
export type Read<T> = { status: "ok"; data: T } | { status: "denied" };

async function orgRead<T>(path: string, empty: T): Promise<Read<T>> {
    const base = await orgBase();
    if (!base) return { status: "ok", data: empty };
    const res = await apiFetch(`${base}${path}`);
    if (res.status === 403) return { status: "denied" };
    if (!res.ok) throw new ApiError(res.status, `GET ${path}`);
    const text = await res.text();
    return { status: "ok", data: text ? (JSON.parse(text) as T) : empty };
}

export type SarohSubscriptionRead =
    | { status: "ok"; subscription: SarohSubscription | null }
    | { status: "denied" };

/**
 * This business's subscription, or null when it has none. `billing:read`
 * (Owner and Admin). The API answers "no subscription" with an empty 200.
 */
export async function getSarohSubscription(): Promise<SarohSubscriptionRead> {
    const read = await orgRead<SarohSubscription | null>(
        "/billing/subscription",
        null,
    );
    return read.status === "denied"
        ? read
        : { status: "ok", subscription: read.data };
}

/**
 * What its plan gives it, row by row, with use, upgrades and any pending
 * move (U12). Request-cached: the rail, a screen's notice and Settings ›
 * Plan read it in one render.
 */
export const getBillingAccess = cache(
    (): Promise<Read<BillingAccessView | null>> =>
        orgRead<BillingAccessView | null>("/billing/access", null),
);

/**
 * The same, for a notice or a lock that is an aid, never the page: null when
 * it can't be read or the role may not read it (the API still refuses the
 * write, and says why). Never a stand-in for the page's own reads.
 */
export async function billingAccessOrNull(): Promise<BillingAccessView | null> {
    try {
        const read = await getBillingAccess();
        return read.status === "ok" ? read.data : null;
    } catch {
        // Degraded, not failed: the notice is an aid the write backs up.
        return null;
    }
}

/**
 * What a move to a lower plan has paused, or will pause (#800), for the
 * banner and the marks on Products, Posts, Team and Locations. Anyone in
 * the business may read it. An aid, like {@link billingAccessOrNull}: null
 * when it can't be read, and the API still refuses a paused write and
 * says why. Request-cached: the shell and a page read it in one render.
 */
export const pausedOrNull = cache(async (): Promise<PausedView | null> => {
    try {
        const read = await orgRead<PausedView | null>("/billing/paused", null);
        return read.status === "ok" ? read.data : null;
    } catch {
        // Degraded, not failed: the marks are an aid the write backs up.
        return null;
    }
});

/** Saroh's invoices to the business, newest first (U17). */
export function listSarohInvoices(): Promise<Read<SarohInvoice[]>> {
    return orgRead<SarohInvoice[]>("/billing/invoices", []);
}

/** The add-ons its plan offers and what it holds (U16). */
export function listAddons(): Promise<Read<AddonsView | null>> {
    return orgRead<AddonsView | null>("/billing/addons", null);
}

/**
 * A checkout waiting to be paid, one scheduled (U15), and the plan's
 * 12-month term (DEC-093).
 */
export async function getCheckouts(): Promise<Read<CheckoutsView>> {
    const read = await orgRead<CheckoutsView>("/billing/checkout", {
        open: null,
        scheduled: null,
        term: null,
    });
    if (read.status !== "ok" || !read.data.open) return read;
    // The window it reopens comes from a provider: checked before use.
    return {
        status: "ok",
        data: {
            ...read.data,
            open: {
                ...read.data.open,
                handoff: cleanHandoff(read.data.open.handoff),
            },
        },
    };
}

/**
 * What moving to a plan would be (U15) — read for the plans offering a
 * trial, so the row says "Start N-day trial" only when this business would
 * get one (one trial per business, ever). Null when it can't be quoted.
 */
export async function quotePlan(
    plan: string,
    cycle: "month" | "year",
): Promise<ChangeQuote | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(
            `${base}/billing/change-plan?${new URLSearchParams({ plan, cycle }).toString()}`,
        );
        return res.ok ? ((await res.json()) as ChangeQuote) : null;
    } catch {
        // The row falls back to "Upgrade"; the dialog's own quote decides.
        return null;
    }
}

/**
 * Saroh's live price list (`GET /public/pricing`, the one saroh.in draws):
 * the plans the picker offers, yearly and trials, and its version. Null when
 * it can't be read or doesn't parse; the picker says so.
 */
export async function livePricing(): Promise<{
    version: number | null;
    catalog: Catalog;
} | null> {
    try {
        const res = await apiFetch("/public/pricing");
        if (!res.ok) return null;
        const body = (await res.json()) as {
            version?: unknown;
            catalog?: unknown;
        } | null;
        return {
            version: typeof body?.version === "number" ? body.version : null,
            catalog: parseCatalog(body?.catalog),
        };
    } catch {
        // A price list that can't be read or parsed: the caller says so.
        return null;
    }
}

/** The live catalogue alone (onboarding's plan intent, U27). */
export async function liveCatalogue(): Promise<Catalog | null> {
    return (await livePricing())?.catalog ?? null;
}

/**
 * SEAM — the line under "Your plan" in the design: what Saroh did for the
 * business last month ("sent 214 receipts and 38 invoices, took ₹1,82,400").
 * No such rollup exists, so the card says so rather than show figures.
 *
 * Expected: `GET /organizations/:organizationId/billing/usage?period=last-month`
 * (`billing:read`) → `{ receipts, invoices, paymentsCents, currency }`.
 */
export function getPlanUsage(): Promise<
    { status: "ok"; usage: PlanUsage } | NotAvailableYet
> {
    return Promise.resolve(NOT_AVAILABLE_YET);
}

/** One of Saroh's invoices as a PDF, for the app's download route (U17). */
export async function getSarohInvoicePdf(
    invoiceId: string,
): Promise<
    | { ok: true; body: ReadableStream<Uint8Array>; disposition: string | null }
    | { ok: false; status: number }
> {
    const base = await orgBase();
    if (!base) return { ok: false, status: 404 };
    const res = await apiFetch(
        `${base}/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    );
    if (!res.ok || !res.body) {
        return { ok: false, status: res.ok ? 502 : res.status };
    }
    return {
        ok: true,
        body: res.body,
        disposition: res.headers.get("content-disposition"),
    };
}
