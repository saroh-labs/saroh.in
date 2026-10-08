import type { PlanRefusal } from "@/lib/billing/refusal";
import { planRefusalOf } from "@/lib/billing/refusal";
import type { BusinessDetail } from "@/lib/organizations/business-details";
import { missingDetailsOf } from "@/lib/organizations/business-details";

/**
 * A write's outcome, with the field a refusal is about. Used where a form
 * needs to put a refusal on the field it is about (discounts, orders).
 *
 * The API puts that field in `error.details.field` — its exception filter
 * forwards only `message` and `details` — and this is the one place that
 * knows it. Everything else in the app reads `field`, the convention it
 * already has. A refusal for want of the business's address or GSTIN
 * (DEC-068) also says which are `missing`, so the screen can ask for them
 * in place (`use-business-details-step.tsx`). A refusal by the business's
 * plan (`PLAN_LIMIT_REACHED`, `MODULE_LOCKED`) carries it as `plan`, so the
 * screen shows the limit notice and the way up, not the message in a toast
 * (`reportFailure`, U14).
 */
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export interface ApiFailure {
    ok: false;
    error: string;
    field?: string;
    missing?: BusinessDetail[];
    plan?: PlanRefusal;
}

interface Envelope {
    message?: unknown;
    details?: unknown;
    error?: unknown;
}

function fieldOf(details: unknown): string | undefined {
    if (details && typeof details === "object" && "field" in details) {
        const field = (details as { field?: unknown }).field;
        return typeof field === "string" ? field : undefined;
    }
    return undefined;
}

/** Read a non-2xx body — any of the shapes the API returns — into a result. */
export function toFailure(body: unknown, fallback: string): ApiFailure {
    const b = (body ?? {}) as Envelope;
    const inner =
        b.error && typeof b.error === "object" ? (b.error as Envelope) : null;
    const message = inner?.message ?? b.message ?? b.error;
    const field = fieldOf(inner?.details) ?? fieldOf(b.details);
    const missing = missingDetailsOf(inner?.details ?? b.details);
    const plan = planRefusalOf(inner?.details ?? b.details, message);
    return {
        ok: false,
        error: typeof message === "string" && message ? message : fallback,
        ...(field ? { field } : {}),
        ...(missing ? { missing } : {}),
        ...(plan ? { plan } : {}),
    };
}
