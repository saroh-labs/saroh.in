import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type {
    WebAddressAvailability,
    WebAddressRead,
    WebAddressView,
} from "./web-address";

/**
 * The web address endpoints (DEC-069, L2), server-only. Settings reads the
 * address here; the Change dialog asks and saves through
 * `web-address-actions.ts`.
 */

/**
 * The read, as a result: Settings › Business draws the rest of its page
 * whether or not this answers, so a failure is said in the section, never
 * thrown to the page.
 */
export async function readWebAddress(): Promise<WebAddressRead> {
    const base = await orgBase();
    if (!base) return { ok: false, missing: true };
    const res = await apiFetch(`${base}/web-address`);
    if (!res.ok) return { ok: false, missing: res.status === 404 };
    const data = (await res.json().catch(() => null)) as WebAddressView | null;
    return data ? { ok: true, data } : { ok: false, missing: false };
}

/** Whether `address` is free to the business; null when it can't be asked. */
export async function webAddressAvailability(
    address: string,
): Promise<WebAddressAvailability | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(
        `${base}/web-address/availability?address=${encodeURIComponent(address)}`,
    );
    if (!res.ok) return null;
    return (await res
        .json()
        .catch(() => null)) as WebAddressAvailability | null;
}

/** A change refused, on the field it names, with the API's suggestion. */
export type ChangeWebAddressResult =
    | { ok: true; data: WebAddressView }
    | { ok: false; error: string; field?: string; suggestion?: string };

/** The suggestion a 409 carries in `details.suggestion`, in either envelope. */
function suggestionOf(body: unknown): string | undefined {
    const b = (body ?? {}) as { details?: unknown; error?: unknown };
    const inner =
        b.error && typeof b.error === "object"
            ? (b.error as { details?: unknown }).details
            : undefined;
    for (const details of [inner, b.details]) {
        if (details && typeof details === "object") {
            const s = (details as { suggestion?: unknown }).suggestion;
            if (typeof s === "string" && s) return s;
        }
    }
    return undefined;
}

export async function changeWebAddress(
    address: string,
): Promise<ChangeWebAddressResult> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/web-address`, {
        method: "PUT",
        body: JSON.stringify({ address }),
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok || !body) {
        const failure = toFailure(body, "Couldn't change your web address.");
        const suggestion = suggestionOf(body);
        return {
            ok: false,
            error: failure.error,
            ...(failure.field ? { field: failure.field } : {}),
            ...(suggestion ? { suggestion } : {}),
        };
    }
    return { ok: true, data: body as WebAddressView };
}
