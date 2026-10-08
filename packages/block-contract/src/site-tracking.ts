/**
 * A merchant site's verification codes and own trackers (DEC-108, #892).
 *
 * The one place that says what a merchant may enter, shared by the API
 * (which refuses anything else) and the workspace (which says so while the
 * merchant types). Two promises rest on it:
 *
 * - **Nothing a merchant enters can run code.** Only public IDs are kept,
 *   each checked against its tool's shape. Saroh writes every loader, from a
 *   fixed list of tools; Google Tag Manager is refused outright, because
 *   whoever controls a container can run anything on the site.
 * - **Nothing secret is stored.** A value shaped like a private key, access
 *   token, API secret or password is refused as a secret, before any format
 *   check, and the refusal never repeats the value.
 *
 * Vendors don't publish official formats, so the shapes are deliberately
 * loose about length and strict about characters: a value can only ever be
 * letters, digits, `-` and `_`, which is also what makes it safe to place
 * inside a loader.
 */

/** The services a site can be verified with, by `<meta>` tag. */
export const VERIFICATION_SERVICES = [
    "google",
    "bing",
    "meta",
    "pinterest",
] as const;
export type VerificationService = (typeof VERIFICATION_SERVICES)[number];

/** The `<meta name>` each service reads. */
export const VERIFICATION_META_NAMES: Readonly<
    Record<VerificationService, string>
> = {
    google: "google-site-verification",
    bing: "msvalidate.01",
    meta: "facebook-domain-verification",
    pinterest: "p:domain_verify",
};

/** The trackers a merchant may connect. Nothing else loads. */
export const TRACKER_KINDS = [
    "ga4",
    "google-ads",
    "meta-pixel",
    "posthog",
    "clarity",
    "plausible",
    "umami",
] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/** Where a PostHog project lives. The loader's host follows from it. */
export const POSTHOG_REGIONS = ["us", "eu"] as const;
export type PosthogRegion = (typeof POSTHOG_REGIONS)[number];

/** Trackers that load without asking the visitor (cookieless). */
export const CONSENT_FREE_TRACKERS: readonly TrackerKind[] = [
    "plausible",
    "umami",
];

const VERIFICATION_SHAPES: Readonly<Record<VerificationService, RegExp>> = {
    // An opaque token, about 43 characters, base64url.
    google: /^[A-Za-z0-9_-]{20,100}$/,
    // A 32-character hex GUID.
    bing: /^[A-Fa-f0-9]{32}$/,
    // About 30 lower-case letters and digits.
    meta: /^[a-z0-9]{20,40}$/,
    // 32 hex characters.
    pinterest: /^[a-f0-9]{32}$/,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TRACKER_SHAPES: Readonly<Record<TrackerKind, RegExp>> = {
    ga4: /^G-[A-Z0-9]{4,16}$/,
    "google-ads": /^AW-\d{6,14}$/,
    "meta-pixel": /^\d{10,20}$/,
    // The project's public key. A personal key (`phx_`) is a secret.
    posthog: /^phc_[A-Za-z0-9]{20,80}$/,
    clarity: /^[a-z0-9]{6,16}$/,
    // Plausible's per-site script id (`pa-…`).
    plausible: /^pa-[A-Za-z0-9_-]{6,64}$/,
    // An Umami Cloud website id.
    umami: UUID,
};

/** Why a value was refused. A secret's refusal never names the value. */
export type CodeProblem = "empty" | "secret" | "tag-manager" | "format";

export type CodeCheck =
    { ok: true; value: string } | { ok: false; problem: CodeProblem };

/**
 * True for a value shaped like something private: a PostHog personal key,
 * a Meta access token, a Stripe-style secret key, a bearer token, or text
 * naming a secret, token, password or API key. Checked before any format,
 * so a secret is always refused as one.
 */
export function looksSecret(value: string): boolean {
    const v = value.trim();
    if (/^phx_/i.test(v)) return true; // PostHog personal API key
    if (/^EAA[A-Za-z0-9]{20,}/.test(v)) return true; // Meta access token
    if (/^(sk|rk)_(live|test)_/i.test(v)) return true; // secret keys
    if (v.startsWith("ya29.")) return true; // Google OAuth access token
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v)) return true;
    return /\b(bearer|secret|password|passwd|api[_-]?key|access[_-]?token|private[_-]?key)\b/i.test(
        v,
    );
}

function check(value: string, shape: RegExp): CodeCheck {
    const v = value.trim();
    if (v === "") return { ok: false, problem: "empty" };
    if (looksSecret(v)) return { ok: false, problem: "secret" };
    if (/^GTM-/i.test(v)) return { ok: false, problem: "tag-manager" };
    return shape.test(v)
        ? { ok: true, value: v }
        : { ok: false, problem: "format" };
}

/** A verification code as it may be stored: the bare code, nothing else. */
export function checkVerificationCode(
    service: VerificationService,
    value: string,
): CodeCheck {
    return check(value, VERIFICATION_SHAPES[service]);
}

/** A tracker's public id as it may be stored. */
export function checkTrackerId(kind: TrackerKind, value: string): CodeCheck {
    return check(value, TRACKER_SHAPES[kind]);
}

export function isVerificationService(v: unknown): v is VerificationService {
    return (
        typeof v === "string" &&
        (VERIFICATION_SERVICES as readonly string[]).includes(v)
    );
}

export function isTrackerKind(v: unknown): v is TrackerKind {
    return (
        typeof v === "string" &&
        (TRACKER_KINDS as readonly string[]).includes(v)
    );
}

export function isPosthogRegion(v: unknown): v is PosthogRegion {
    return (
        typeof v === "string" &&
        (POSTHOG_REGIONS as readonly string[]).includes(v)
    );
}

/**
 * The code inside whatever a merchant pasted: the bare code, or the
 * `<meta>` tag the service gave them. The result still goes through
 * {@link checkVerificationCode}; this only finds the candidate.
 */
export function extractVerificationCode(
    service: VerificationService,
    pasted: string,
): string {
    const text = pasted.trim();
    // Every regex special character escaped, not only the ones today's names
    // use: a name added later must never change what the pattern matches.
    const name = VERIFICATION_META_NAMES[service].replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );
    const tag = new RegExp(
        `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`,
        "i",
    ).exec(text);
    if (tag) {
        // Either order of `name` and `content`: one of the two groups matched.
        const groups: (string | undefined)[] = tag.slice(1);
        return (groups.find((g) => g !== undefined) ?? "").trim();
    }
    return text;
}

/**
 * A tracker's id inside whatever a merchant pasted: the id itself, or the
 * snippet the tool gave them. PostHog's region comes with it when the
 * snippet names its host. Only what this returns ever leaves the browser;
 * the rest of a pasted snippet is thrown away, and a value that looks
 * secret is returned as-is so the check refuses it as one.
 */
export function extractTrackerId(
    kind: TrackerKind,
    pasted: string,
): { id: string; region?: PosthogRegion } {
    const text = pasted.trim();
    if (looksSecret(text) && !/<script/i.test(text)) return { id: text };
    const first = (re: RegExp) => re.exec(text)?.[1] ?? null;
    switch (kind) {
        case "ga4":
            return { id: first(/\b(G-[A-Z0-9]{4,16})\b/) ?? text };
        case "google-ads":
            return { id: first(/\b(AW-\d{6,14})\b/) ?? text };
        case "meta-pixel":
            return {
                id:
                    first(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/) ??
                    first(/[?&]id=(\d{10,20})/) ??
                    text,
            };
        case "posthog": {
            const id = first(/\b(phc_[A-Za-z0-9]{20,80})\b/) ?? text;
            const region = /\beu(?:-assets)?\.i\.posthog\.com\b/i.test(text)
                ? "eu"
                : /\bus(?:-assets)?\.i\.posthog\.com\b/i.test(text)
                  ? "us"
                  : undefined;
            return region ? { id, region } : { id };
        }
        case "clarity":
            return {
                id:
                    first(/clarity\.ms\/tag\/["' +]*([a-z0-9]{6,16})/i) ??
                    first(
                        /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,16})["']/i,
                    ) ??
                    text,
            };
        case "plausible":
            return { id: first(/\/js\/(pa-[A-Za-z0-9_-]{6,64})\.js/) ?? text };
        case "umami":
            return {
                id:
                    first(/data-website-id=["']([0-9a-f-]{36})["']/i) ??
                    text.toLowerCase(),
            };
    }
}

/**
 * The privacy page a site's cookie banner links to, when the merchant has
 * their own: an `https` address with no credentials in it. Null for
 * anything else.
 */
export function checkPrivacyUrl(value: string): string | null {
    const v = value.trim();
    if (v === "" || v.length > 2000) return null;
    let url: URL;
    try {
        url = new URL(v);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
}
