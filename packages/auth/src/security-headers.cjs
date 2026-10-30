// @ts-check
"use strict";

/**
 * The page policies every Saroh app sends with its pages, beside the
 * SECURITY_HEADERS in its next.config (pentest, 29 Oct 2026): a
 * Content-Security-Policy that only REPORTS for now, and a Permissions-Policy
 * that is enforced. Plain CommonJS so the apps' next.config files (and
 * `scripts/check-security-headers.mjs`) load it with no build step.
 *
 * Only pages need them: a policy governs a document, so neither goes in
 * `public/_headers` (files) or `withPrivateApp` (redirects).
 *
 * The CSP lists what each app's browser really loads; a host missing here
 * shows up as a "[Report Only]" line in the console, and is blocked by
 * nothing. Enforce it once a release
 * runs clean.
 */

/** Where business media is served from (R2's public buckets, prod and dev). */
const MEDIA = ["https://media.saroh.in", "https://media.saroh.io"];

/** PostHog's EU host, the default when NEXT_PUBLIC_POSTHOG_HOST isn't set. */
const POSTHOG_DEFAULT = "https://eu.i.posthog.com";

const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * Third parties an app may load, by name. Each lists the hosts per CSP
 * directive (`script`, `connect`, `img`, `frame`).
 * @type {Record<string, Partial<Record<"script" | "connect" | "img" | "frame", string[]>>>}
 */
const SOURCES = {
    // Cloudflare Web Analytics: the zone injects its beacon into every page.
    cloudflare: {
        script: ["https://static.cloudflareinsights.com"],
        connect: ["https://cloudflareinsights.com"],
    },
    // Turnstile, before a sign-in code is sent (@saroh/site-blocks/challenge).
    turnstile: { script: [TURNSTILE], frame: [TURNSTILE] },
    // MSG91's OTP widget (SMS codes); the API names the script (DEC-196).
    msg91: {
        script: ["https://verify.msg91.com"],
        connect: ["https://*.msg91.com"],
    },
    // Razorpay's checkout window: a script, then its own frame.
    razorpay: {
        script: ["https://checkout.razorpay.com"],
        frame: ["https://api.razorpay.com", "https://checkout.razorpay.com"],
        connect: ["https://*.razorpay.com"],
        img: ["https://*.razorpay.com"],
    },
    // Presigned PUTs straight to R2 (00-universal §10).
    uploads: { connect: ["https://*.r2.cloudflarestorage.com"] },
    // The seeded sample businesses' photos (database seed, showcase).
    unsplash: { img: ["https://images.unsplash.com"] },
    // Google's tag (Analytics + Ads, after consent; ADS_TRACKING.md), as
    // Google's own CSP guide lists it. google.co.in: visitors in India.
    google: {
        script: [
            "https://*.googletagmanager.com",
            "https://www.googleadservices.com",
            "https://googleads.g.doubleclick.net",
            "https://www.google.com",
        ],
        connect: [
            "https://*.google-analytics.com",
            "https://*.analytics.google.com",
            "https://*.googletagmanager.com",
            "https://*.g.doubleclick.net",
            "https://www.google.com",
            "https://www.google.co.in",
            "https://pagead2.googlesyndication.com",
            "https://www.googleadservices.com",
        ],
        img: [
            "https://*.google-analytics.com",
            "https://*.googletagmanager.com",
            "https://*.g.doubleclick.net",
            "https://www.google.com",
            "https://www.google.co.in",
        ],
        frame: [
            "https://td.doubleclick.net",
            "https://www.googletagmanager.com",
        ],
    },
    // The Meta Pixel (after consent; ADS_TRACKING.md).
    meta: {
        script: ["https://connect.facebook.net"],
        connect: ["https://connect.facebook.net", "https://www.facebook.com"],
        img: ["https://www.facebook.com"],
    },
};

/** `url`'s origin, or null for an empty or malformed one. */
function originOf(/** @type {string | undefined} */ url) {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

/**
 * @typedef {object} PageHeaderOptions
 * @property {(string | undefined)[]} [origins] First-party origins the browser
 *   calls or loads from: the API, sign-in. Unset or malformed ones are dropped.
 * @property {(keyof typeof SOURCES)[]} [uses] The third parties this app loads.
 * @property {string} [posthogHost] NEXT_PUBLIC_POSTHOG_HOST.
 * @property {boolean} [dev] `next dev`, whose scripts need eval.
 */

/** @param {PageHeaderOptions} options */
function contentSecurityPolicy({
    origins = [],
    uses = [],
    posthogHost,
    dev = false,
} = {}) {
    const own = Array.from(
        new Set(origins.map(originOf).filter((o) => o !== null)),
    );
    const from = (/** @type {"script" | "connect" | "img" | "frame"} */ kind) =>
        ["cloudflare", ...uses].flatMap((name) => SOURCES[name]?.[kind] ?? []);
    const list = (/** @type {string[]} */ ...sources) =>
        Array.from(new Set(sources)).join(" ");

    return [
        "default-src 'self'",
        // TODO(csp): Next's inline bootstrap needs 'unsafe-inline' until the
        // apps send a nonce; required before this policy is enforced.
        `script-src ${list("'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...from("script"))}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src ${list("'self'", "data:", "blob:", ...own, ...MEDIA, ...from("img"))}`,
        `media-src ${list("'self'", "blob:", ...own, ...MEDIA)}`,
        "font-src 'self' data:",
        `connect-src ${list("'self'", ...own, originOf(posthogHost) ?? POSTHOG_DEFAULT, ...from("connect"))}`,
        `frame-src ${list("'self'", ...from("frame"))}`,
        // PostHog's session recorder runs in a blob: worker.
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
    ].join("; ");
}

/**
 * Browser features no Saroh page uses, switched off for the page and every
 * frame in it. Payment stays open to Razorpay's frame where it runs (Google
 * Pay through the Payment Request API). The merchant sites send their own,
 * without the payment line (apps/saroh.app/next.config.js).
 *
 * Only features every current Chrome knows: it logs an unknown one as a
 * console error on every page, so no `interest-cohort` (FLoC, removed) and
 * no `browsing-topics` (Topics, being retired with the Privacy Sandbox).
 *
 * @param {(keyof typeof SOURCES)[]} [uses]
 */
function permissionsPolicy(uses = []) {
    const payment = uses.includes("razorpay")
        ? 'payment=(self "https://api.razorpay.com")'
        : "payment=()";
    return [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "usb=()",
        payment,
    ].join(", ");
}

/**
 * Both, as next.config `headers()` entries.
 * @param {PageHeaderOptions} options
 */
function pageSecurityHeaders(options = {}) {
    return [
        {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy(options),
        },
        {
            key: "Permissions-Policy",
            value: permissionsPolicy(options.uses),
        },
    ];
}

module.exports = {
    contentSecurityPolicy,
    permissionsPolicy,
    pageSecurityHeaders,
};
