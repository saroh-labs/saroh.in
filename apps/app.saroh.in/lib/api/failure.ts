/**
 * A write's outcome, with the field a refusal is about. Used where a form
 * needs to put a refusal on the field it is about (discounts, orders).
 *
 * The API puts that field in `error.details.field` — its exception filter
 * forwards only `message` and `details` — and this is the one place that
 * knows it. Everything else in the app reads `field`, the convention it
 * already has.
 */
export type ApiResult<T> =
    { ok: true; data: T } | { ok: false; error: string; field?: string };

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
export function toFailure(
    body: unknown,
    fallback: string,
): { ok: false; error: string; field?: string } {
    const b = (body ?? {}) as Envelope;
    const inner =
        b.error && typeof b.error === "object" ? (b.error as Envelope) : null;
    const message = inner?.message ?? b.message ?? b.error;
    const field = fieldOf(inner?.details) ?? fieldOf(b.details);
    return {
        ok: false,
        error: typeof message === "string" && message ? message : fallback,
        ...(field ? { field } : {}),
    };
}
