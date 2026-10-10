import { splitScheme } from "@/lib/link-preview";
import { SITE_URL } from "@/lib/seo";

/**
 * The QR code maker's shapes and rules on saroh.in (QR codes plan U9). The
 * code is drawn by `@saroh/ui/lib/qr-art`; this is what the page decides
 * around it. Pure, so it is tested without a browser.
 */

/**
 * The code colours the design offers, in its order. These are the code's
 * own ink, drawn into the SVG and the downloaded files, not page styling,
 * which is why they are hex values and not tokens. The last is too light
 * to scan on white and shows the page's warning, as the design draws it.
 */
export const QR_SWATCHES = [
    { hex: "#1C1C1A", name: "Ink" },
    { hex: "#5C2A48", name: "Plum" },
    { hex: "#1F4D3A", name: "Green" },
    { hex: "#1E3A5F", name: "Navy" },
    { hex: "#F0A92B", name: "Saffron" },
] as const;

export const QR_DEFAULT_COLOUR = QR_SWATCHES[0].hex;

/** What the code opens while the link field is empty: this page. */
export const QR_SAMPLE_LINK = `${SITE_URL}/tools/qr-code-maker`;

/** The longest label the pill takes. */
export const QR_LABEL_MAX = 40;

/** The largest logo file the page reads: it is inlined into the SVG. */
export const QR_LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The link a typed address makes: "" for an empty field, otherwise the
 * address with its scheme. Spaces are dropped rather than encoded; nobody
 * means one in a web address.
 */
export function qrLink(scheme: "https" | "http", rest: string): string {
    const text = rest.trim().replace(/\s+/g, "");
    return text ? `${scheme}://${text}` : "";
}

/** What was typed or pasted, with any scheme of its own taken off. */
export function typedLink(
    value: string,
    scheme: "https" | "http",
): { rest: string; scheme: "https" | "http" } {
    const split = splitScheme(value);
    return {
        rest: split.rest === value.trim() ? value : split.rest,
        scheme: split.scheme ?? scheme,
    };
}

export type LogoProblem = "not-picture" | "too-big";

/** Why a chosen file can't be the logo, or null when it can. */
export function logoProblem(file: {
    type: string;
    size: number;
}): LogoProblem | null {
    if (!file.type.startsWith("image/")) return "not-picture";
    if (file.size > QR_LOGO_MAX_BYTES) return "too-big";
    return null;
}

/** What `/api/qr-code-maker/unlock` answers. */
export type QrUnlockResult =
    | { unlocked: true; emailed: "sent" | "limited" | "not-sent" }
    | {
          unlocked: false;
          failure: "bad-email" | "rate-limited" | "unavailable";
      };

/** An email worth sending to the API: something@something.something. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
