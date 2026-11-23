// @ts-check
"use strict";

/**
 * The page policies every Saroh app sends with its pages, beside the
 * SECURITY_HEADERS in its next.config (pentest, 29 Oct 2026): a
 * Content-Security-Policy and a Permissions-Policy. Plain CommonJS so the
 * apps' next.config files, their middleware and
 * `scripts/check-security-headers.mjs` load it with no build step.
 *
 * The signed-in apps (app, admin, accounts) ENFORCE the CSP with a fresh
 * script nonce per answer, set by `withPrivateApp`'s middleware (21 Nov
 * 2026); saroh.in still only reports it. The CSP lists what each app's
 * browser really loads; a host missing here is blocked.
 */

/**
 * Where business media is served from (R2's public buckets): India's and
 * development's, and Global businesses' own (owner, 22 Nov 2026).
 */
// prettier-ignore
const MEDIA = ["https://media.saroh.in", "https://media.saroh.io", "https://media.saroh.tech"];

/**
 * The floor the signed-in apps and the merchant sites enforce (security
 * review, 21 Nov 2026): no framing by another site, no inline event handler
 * (`<img onerror=…>`, the usual injected payload), no plugins, no moved base.
 * Each `public/_headers` sends it on the files Cloudflare serves without the
 * Worker; on pages the middleware sends the full policy instead, which
 * contains every directive of this one. `PRIVATE_APP_HEADERS` repeats it as
 * text; `check:security-headers` keeps them the same.
 */
const ENFORCED_CSP =
    "frame-ancestors 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'";

/** Sent with every page: a link to another site carries the origin only. */
const REFERRER_POLICY = "strict-origin-when-cross-origin";

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
    phoneCodeWidget: {
        // The widget's loader, and what it loads from its own hosts.
        script: ["https://verify.msg91.com", "https://*.msg91.com"],
        connect: ["https://*.msg91.com"],
    },
    // Razorpay's checkout window: a script, then its own frame.
    razorpay: {
        // checkout.js, and what it loads from Razorpay's own hosts.
        script: ["https://checkout.razorpay.com", "https://*.razorpay.com"],
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
 * @property {string} [nonce] This answer's script nonce: the policy is then
 *   the enforced one (scripts by nonce only, no inline handler, no framing).
 * @property {boolean} [enforced] next.config only: the middleware enforces
 *   the CSP with a nonce, so no report-only copy is sent. (On Workers a
 *   next.config header of the same name would REPLACE the middleware's.)
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
    nonce,
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
        // With a nonce: scripts carrying it, Saroh's own files and the listed
        // hosts, nothing else. No 'strict-dynamic': Chrome lets it run ANY
        // script added through the DOM, an injected inline one included
        // (checked 21 Nov 2026), so what a third party loads in turn must be
        // from its listed host. `next dev` needs eval (React's error stacks);
        // production never.
        `script-src ${list("'self'", ...(nonce ? [`'nonce-${nonce}'`] : ["'unsafe-inline'"]), ...(dev ? ["'unsafe-eval'"] : []), ...from("script"))}`,
        // Inline styles stay: React's `style={…}` props, Radix's positioning
        // and next/font's tags write them, and none can carry a nonce.
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
        // Ignored in a report-only policy, so only with the enforced one.
        ...(nonce ? ["frame-ancestors 'self'", "script-src-attr 'none'"] : []),
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
 * Both (the CSP only when the middleware doesn't enforce it), and the
 * Referrer-Policy, as next.config `headers()` entries.
 * @param {PageHeaderOptions} options
 */
function pageSecurityHeaders(options = {}) {
    return [
        ...(options.enforced
            ? []
            : [
                  {
                      key: "Content-Security-Policy-Report-Only",
                      value: contentSecurityPolicy(options),
                  },
              ]),
        {
            key: "Permissions-Policy",
            value: permissionsPolicy(options.uses),
        },
        { key: "Referrer-Policy", value: REFERRER_POLICY },
    ];
}

module.exports = {
    ENFORCED_CSP,
    MEDIA,
    REFERRER_POLICY,
    contentSecurityPolicy,
    permissionsPolicy,
    pageSecurityHeaders,
};
