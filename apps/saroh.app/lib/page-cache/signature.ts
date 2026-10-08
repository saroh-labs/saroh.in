/**
 * The API's signature on a page-cache revalidation (#863).
 *
 *   x-saroh-page-cache: v1.<unix seconds>.<base64url(sig)>
 *
 * where `sig` is HMAC-SHA256 over `v1\n<seconds>\n<body>` with
 * `SITE_RELAY_SECRET`, the secret the API and this renderer already share
 * (ADR-011). Exactly the API's `signPageRevalidation`
 * (`apps/api.saroh.in/src/modules/sites/page-cache-signature.ts`); both
 * test files pin the same vector, so a change to one side fails there.
 *
 * WebCrypto, not `node:crypto`: it runs in the Worker's entry, before Next.
 */

export const REVALIDATE_SIGNATURE_HEADER = "x-saroh-page-cache";
const VERSION = "v1";
/** How old a signature may be. A replay inside it only revalidates again. */
export const MAX_SKEW_SECONDS = 300;

function base64url(bytes: Uint8Array): string {
    let s = "";
    bytes.forEach((b) => {
        s += String.fromCharCode(b);
    });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, text: string): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    return new Uint8Array(
        await crypto.subtle.sign("HMAC", key, enc.encode(text)),
    );
}

/** The header value for `body`, signed at `now` (ms). */
export async function signPageRevalidation(
    body: string,
    secret: string,
    now: number = Date.now(),
): Promise<string> {
    const seconds = String(Math.floor(now / 1000));
    const sig = await hmac(secret, `${VERSION}\n${seconds}\n${body}`);
    return `${VERSION}.${seconds}.${base64url(sig)}`;
}

/** Compare in time that doesn't depend on where the strings differ. */
function sameText(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Whether `header` signs `body` with `secret`, recently enough. */
export async function verifyPageRevalidation(
    header: string | null,
    body: string,
    secret: string,
    now: number = Date.now(),
): Promise<boolean> {
    if (!header) return false;
    const parts = header.split(".");
    if (parts.length !== 3) return false;
    const [version, seconds, sig] = parts;
    if (version !== VERSION || !seconds || !sig) return false;
    if (!/^\d{1,12}$/.test(seconds)) return false;
    const age = Math.abs(now / 1000 - Number(seconds));
    if (age > MAX_SKEW_SECONDS) return false;
    const expected = await signPageRevalidation(
        body,
        secret,
        Number(seconds) * 1000,
    );
    return sameText(expected, header);
}
