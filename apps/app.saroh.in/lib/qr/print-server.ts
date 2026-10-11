import { apiFetch, orgBase } from "@/lib/api/http";

import { qrFailure } from "./failure";
import type { QrPrintFormat } from "./print";
import { printFailure, QR_PRINT_LOGO_HEADER } from "./print";
import type { QrResult } from "./types";

/**
 * A code's print file from the API (`…/qr-codes/:id/print`), for the app's
 * own download route. Server-only (`apiFetch` forwards the session and the
 * active organization), so the browser never holds the API's address or a
 * session header, and cannot ask for another business's code.
 *
 * A refusal keeps what the API said it was about (`failure.ts`): the reason
 * on a 409 (retired, no address) and the plan's lock, so the screen can say
 * each as what it is.
 */
export type QrPrintFailure = Omit<
    Extract<QrResult<never>, { ok: false }>,
    "ok" | "field"
>;

export async function getQrPrint(
    siteId: string,
    qrCodeId: string,
    format: QrPrintFormat,
): Promise<
    | {
          ok: true;
          body: ReadableStream<Uint8Array>;
          disposition: string | null;
          /** `image`, `initials` or `none`, as the API's header says. */
          logo: string | null;
      }
    | { ok: false; status: number; failure: QrPrintFailure }
> {
    const base = await orgBase();
    if (!base) {
        return {
            ok: false,
            status: 404,
            failure: { error: printFailure(404) },
        };
    }
    const res = await apiFetch(
        `${base}/sites/${encodeURIComponent(siteId)}/qr-codes/${encodeURIComponent(qrCodeId)}/print?format=${format}`,
    );
    if (!res.ok || !res.body) {
        const status = res.ok ? 502 : res.status;
        // A server failure's words are generic: say ours instead.
        const body: unknown =
            status >= 500 ? null : await res.json().catch(() => null);
        const { error, reason, plan } = qrFailure(body, printFailure(status));
        return {
            ok: false,
            status,
            failure: {
                error,
                ...(reason ? { reason } : {}),
                ...(plan ? { plan } : {}),
            },
        };
    }
    return {
        ok: true,
        body: res.body,
        disposition: res.headers.get("content-disposition"),
        logo: res.headers.get(QR_PRINT_LOGO_HEADER),
    };
}
