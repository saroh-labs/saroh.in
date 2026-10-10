import { toFailure } from "@/lib/api/failure";

import type { QrRefusalReason, QrResult } from "./types";

/**
 * A refused QR save as the screen reads it. The API says what it was about
 * in `details` (`{ field: "target" | "color", reason }`, or a bare
 * `{ reason }` on a 409) and a plan's lock as `MODULE_LOCKED`; this keeps
 * all three, so the refusal is said beside the control that caused it.
 * Pure, so it is tested without a request.
 */

const REASONS: readonly QrRefusalReason[] = [
    "unknown",
    "booking-closed",
    "shop-closed",
    "product-missing",
    "page-missing",
    "format",
    "too-light",
    "retired",
    "too-many",
    "no-free-code",
    "no-address",
    "unencodable",
];

function detailsOf(body: unknown): Record<string, unknown> {
    const outer = (body ?? {}) as { error?: unknown; details?: unknown };
    const inner =
        outer.error && typeof outer.error === "object"
            ? (outer.error as { details?: unknown }).details
            : outer.details;
    return inner && typeof inner === "object"
        ? (inner as Record<string, unknown>)
        : {};
}

export function qrFailure(
    body: unknown,
    fallback: string,
): Extract<QrResult<never>, { ok: false }> {
    const failure = toFailure(body, fallback);
    const details = detailsOf(body);
    const reason = REASONS.find((r) => r === details.reason);
    const field =
        failure.field === "target" || failure.field === "color"
            ? failure.field
            : undefined;
    return {
        ok: false,
        error: failure.error,
        ...(field ? { field } : {}),
        ...(reason ? { reason } : {}),
        ...(failure.plan ? { plan: failure.plan } : {}),
    };
}
