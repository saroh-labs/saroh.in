import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import { qrFailure } from "./failure";
import type {
    QrCodeChange,
    QrCodeInput,
    QrCodesView,
    QrCodeView,
    QrResult,
} from "./types";

/**
 * A site's QR codes (Settings › Share): the read and the three writes,
 * `organizations/:org/sites/:siteId/qr-codes`. Server-only.
 *
 * The list is a required read of its page: a failure throws to the tab's
 * `error.tsx` (which offers Try again) and a 403 is `forbidden()`, never an
 * empty list. A refused write keeps what the API said it was about
 * (`failure.ts`), so the screen says it beside the control that caused it.
 */

function codesPath(base: string, siteId: string): string {
    return `${base}/sites/${encodeURIComponent(siteId)}/qr-codes`;
}

/** The site's codes; null when the site isn't this business's (a 404). */
export async function listQrCodes(siteId: string): Promise<QrCodesView | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<QrCodesView>(codesPath(base, siteId));
}

async function write(
    path: (base: string) => string,
    method: "POST" | "PATCH",
    body: unknown,
    fallback: string,
): Promise<QrResult<QrCodeView>> {
    try {
        const base = await orgBase();
        if (!base) return { ok: false, error: "No active business." };
        const res = await apiFetch(path(base), {
            method,
            body: JSON.stringify(body ?? {}),
        });
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) return qrFailure(data, fallback);
        const code = data as QrCodeView | null;
        return code &&
            typeof code.id === "string" &&
            typeof code.code === "string"
            ? { ok: true, data: code }
            : { ok: false, error: fallback };
    } catch {
        return { ok: false, error: fallback };
    }
}

/** Make a code. Its short link exists from here on. */
export function createQrCode(
    siteId: string,
    input: QrCodeInput,
): Promise<QrResult<QrCodeView>> {
    return write(
        (base) => codesPath(base, siteId),
        "POST",
        input,
        "We couldn't make that code. Try again.",
    );
}

/** Re-point a code, or change how it looks. Its link never changes. */
export function updateQrCode(
    siteId: string,
    qrCodeId: string,
    change: QrCodeChange,
): Promise<QrResult<QrCodeView>> {
    return write(
        (base) => `${codesPath(base, siteId)}/${encodeURIComponent(qrCodeId)}`,
        "PATCH",
        change,
        "We couldn't save that. Try again.",
    );
}

/** Retire a code: its scans stay, and its paper opens the home page. */
export function retireQrCode(
    siteId: string,
    qrCodeId: string,
): Promise<QrResult<QrCodeView>> {
    return write(
        (base) =>
            `${codesPath(base, siteId)}/${encodeURIComponent(qrCodeId)}/retire`,
        "POST",
        {},
        "We couldn't retire that code. Try again.",
    );
}
