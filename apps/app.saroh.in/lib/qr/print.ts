import type { PlanRefusal } from "@/lib/billing/refusal";

import type { QrRefusalReason } from "./types";

/**
 * "Ready to print" in Settings › Share: a saved code as a PDF at the real
 * size of the thing it goes on, drawn by the API on request. The browser
 * fetches it through this app's own `/api/qr-codes/…/print` (the session
 * stays server-side, as for an invoice's PDF) and saves it under the name
 * the API gives. Client-safe: no server imports.
 */

export const QR_PRINT_FORMATS = ["standee", "tent", "sticker", "card"] as const;
export type QrPrintFormat = (typeof QR_PRINT_FORMATS)[number];

export function isQrPrintFormat(value: unknown): value is QrPrintFormat {
    return QR_PRINT_FORMATS.some((f) => f === value);
}

/** What went in a branded code's centre box, as the API says it. */
export type QrPrintLogo = "image" | "initials" | "none";

/** The API's header for it, sent on by the app's route. */
export const QR_PRINT_LOGO_HEADER = "x-saroh-qr-logo";

export interface QrPrintFormatView {
    format: QrPrintFormat;
    name: string;
    /** The finished size as a merchant reads it. */
    size: string;
    /** The finished size in mm (`QR_PRINT_SPECS` in the API). */
    trim: { width: number; height: number };
    /** The code's square on that paper, in mm. */
    code: number;
    /** Cut round. */
    round: boolean;
    /** The name and label sit beside the code, not above and below it. */
    beside: boolean;
}

/** The four files, in the design's order, at the API's sizes. */
export const QR_PRINTS: readonly QrPrintFormatView[] = [
    {
        format: "standee",
        name: "Counter standee",
        size: "A5 · 148 × 210 mm",
        trim: { width: 148, height: 210 },
        code: 112,
        round: false,
        beside: false,
    },
    {
        format: "tent",
        name: "Table tent",
        size: "100 × 140 mm",
        trim: { width: 100, height: 140 },
        code: 76,
        round: false,
        beside: false,
    },
    {
        format: "sticker",
        name: "Round sticker",
        size: "60 mm across",
        trim: { width: 60, height: 60 },
        code: 32,
        round: true,
        beside: false,
    },
    {
        format: "card",
        name: "Card",
        size: "89 × 51 mm",
        trim: { width: 89, height: 51 },
        code: 43,
        round: false,
        beside: true,
    },
];

/** This app's route for one file. */
export function qrPrintPath(
    siteId: string,
    qrCodeId: string,
    format: QrPrintFormat,
): string {
    return `/api/qr-codes/${encodeURIComponent(siteId)}/${encodeURIComponent(qrCodeId)}/print?format=${format}`;
}

/** The name in `attachment; filename="…"`, else a plain one for the format. */
export function printFileName(
    disposition: string | null,
    format: QrPrintFormat,
): string {
    const named = disposition?.match(/filename="([^"]+)"/)?.[1];
    return named ?? `qr-${format}.pdf`;
}

/** Why the API won't draw a file (`details.reason` on its 409), in our words. */
const BY_REASON: Partial<Record<QrRefusalReason, string>> = {
    retired: "This code is retired, so it can't be printed.",
    "no-address":
        "This site has no web address yet, so the code has no link to print.",
    unencodable: "This code's link is too long to print as a QR.",
};

/**
 * What a refused file says when the API gave no words: ours for its reason,
 * else by status. Never a status code or a raw body.
 */
export function printFailure(status: number, reason?: QrRefusalReason): string {
    const known = reason ? BY_REASON[reason] : undefined;
    if (known) return known;
    if (status === 403) return "Your role can't download this file.";
    if (status === 404) return "This code wasn't found. Reload and try again.";
    return "Couldn't make the PDF. Try again.";
}

const NO_REACH = "Couldn't reach Saroh. Check your connection and try again.";

export type QrPrintResult =
    | {
          ok: true;
          fileName: string;
          /** Null when the answer didn't say. */
          logo: QrPrintLogo | null;
      }
    | {
          ok: false;
          error: string;
          reason?: QrRefusalReason;
          /** Its plan refused it (`MODULE_LOCKED`, row `qr-branding`). */
          plan?: PlanRefusal;
      };

/** What the browser gives a print download; replaced in tests. */
export interface PrintEnv {
    fetch: (path: string) => Promise<Response>;
    save: (blob: Blob, filename: string) => void;
}

function save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // After the click has been taken, so the download isn't cut off.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const PRINT_BROWSER: PrintEnv = {
    fetch: (path) => fetch(path, { cache: "no-store" }),
    save,
};

function logoOf(value: string | null): QrPrintLogo | null {
    return value === "image" || value === "initials" || value === "none"
        ? value
        : null;
}

/** Fetch one print file and hand it to the browser to save. */
export async function downloadQrPrint(
    siteId: string,
    qrCodeId: string,
    format: QrPrintFormat,
    env: PrintEnv = PRINT_BROWSER,
): Promise<QrPrintResult> {
    let res: Response;
    try {
        res = await env.fetch(qrPrintPath(siteId, qrCodeId, format));
    } catch {
        return { ok: false, error: NO_REACH };
    }
    if (!res.ok) {
        // The app's route answers `{ error, reason?, plan? }` (`print-server.ts`).
        const body = (await res.json().catch(() => null)) as {
            error?: unknown;
            reason?: QrRefusalReason;
            plan?: PlanRefusal;
        } | null;
        return {
            ok: false,
            error:
                typeof body?.error === "string" && body.error.trim()
                    ? body.error
                    : printFailure(res.status, body?.reason),
            ...(body?.reason ? { reason: body.reason } : {}),
            ...(body?.plan ? { plan: body.plan } : {}),
        };
    }
    let blob: Blob;
    try {
        blob = await res.blob();
    } catch {
        return { ok: false, error: NO_REACH };
    }
    const fileName = printFileName(
        res.headers.get("content-disposition"),
        format,
    );
    env.save(blob, fileName);
    return {
        ok: true,
        fileName,
        logo: logoOf(res.headers.get(QR_PRINT_LOGO_HEADER)),
    };
}

/** "data:image/webp;base64,…" → "WebP"; null for a type a print file takes. */
function unprintableType(dataUrl: string): string | null {
    const type = /^data:([a-z0-9.+/-]+)[;,]/i.exec(dataUrl)?.[1]?.toLowerCase();
    if (!type || type === "image/png" || type === "image/jpeg") return null;
    if (type === "image/webp") return "WebP";
    return "different";
}

/**
 * Why a branded code's file carries initials where the screen draws the
 * logo, in one line. Only what is known is said: the API tells us initials
 * went in; the logo's kind is known only when this app could read it.
 *
 * - No logo set: nothing to explain, the screen already draws initials.
 * - Read here as something other than PNG or JPEG: that is why.
 * - Read here as PNG or JPEG: the API couldn't have it just then.
 * - Not read here either: the rule, without guessing which applied.
 */
export function printInitialsNote(business: {
    hasLogo: boolean;
    dataUrl: string | null;
}): string | null {
    if (!business.hasLogo) return null;
    const lead = "This file has your initials in place of your logo.";
    if (!business.dataUrl) {
        return `${lead} Print files can use a PNG or JPG logo, and yours couldn't be used this time.`;
    }
    const kind = unprintableType(business.dataUrl);
    if (kind === "WebP") {
        return `${lead} Print files can use a PNG or JPG logo, and yours is a WebP image.`;
    }
    if (kind) {
        return `${lead} Print files can use a PNG or JPG logo, and yours is a different kind of image.`;
    }
    return `${lead} Your logo couldn't be read just now. Download it again to try once more.`;
}
