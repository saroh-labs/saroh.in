// A production deployment that falls back to built-in addresses talks to
// whatever the code assumed; one missing variable once dropped every waitlist
// join for two days (DEV_LEARNINGS, 5 Oct 2026). So a production build (`VERCEL_ENV`;
// this app's wrangler.jsonc doesn't set it yet, so the check is off on its Worker)
// refuses to start without these (the API every merchant page reads, its own domain and the relay that keeps the API's rate limits per visitor). Other previews and local builds
// keep their fallbacks (plan 2026-10-05-001 KTD-3).
const REQUIRED_IN_PRODUCTION = [
    "API_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_ROOT_DOMAIN",
    "SITE_RELAY_SECRET",
];

// The `development` branch's deployments serve the dev environment's merchant
// sites (*.dev.saroh.app); without these they would quietly read production.
const REQUIRED_IN_DEVELOPMENT = REQUIRED_IN_PRODUCTION;
const required =
    process.env.VERCEL_ENV === "production"
        ? REQUIRED_IN_PRODUCTION
        : process.env.VERCEL_GIT_COMMIT_REF === "development"
          ? REQUIRED_IN_DEVELOPMENT
          : [];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
    throw new Error(
        `saroh.app: ${missing.join(", ")} must be set for a ${process.env.VERCEL_ENV === "production" ? "production" : "development"} deployment.`,
    );
}

/**
 * Hosts a test release is served on, as Next's `has` host regexes. Next
 * matches them against the whole host, lower-cased and without its port.
 * Broader than the classifier on purpose (`test.<anything>.<tld>` too): a
 * header that says "don't index" on a host that is never live costs nothing.
 */
const TEST_HOST_PATTERNS = ["test--.+", "test\\..+\\..+"];

// Every response: HTTPS only from the first visit on, never shown inside
// another site's frame (so a sign-in or a button can't be dressed up and
// clicked through from elsewhere), and no guessing a file's type. The app's
// own previews are same-origin, so 'self' may still frame it.
//
// No includeSubDomains here: on a merchant's own domain it would force HTTPS
// on every subdomain of their business, including ones Saroh doesn't serve.
const SECURITY_HEADERS = [
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
];

/**
 * Crawlers that get the page's metadata in `<head>`, rendered before the body
 * rather than streamed after it (DEC-108, #894). Search Console, Bing, Meta
 * and Pinterest verify a site by reading a `<meta>` tag in the head, and they
 * keep checking. Next 16's own list (`html-bots.ts`) is kept whole here and
 * extended with the crawlers it leaves out: Googlebot itself, and Pinterest's
 * verifier. Everyone else still gets streamed metadata.
 */
const HTML_LIMITED_BOTS = new RegExp(
    [
        // Next 16.3's default list.
        "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight",
        // Added for site verification.
        "Googlebot|Pinterest",
    ].join("|"),
    "i",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
    htmlLimitedBots: HTML_LIMITED_BOTS,
    // Development logs every server action's arguments by default, and some
    // carry secrets: provider keys, sign-in codes (UX-005, 7 Oct). Production
    // never logs them; this keeps local logs clean too.
    logging: { serverFunctions: false },
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui", "@saroh/site-blocks"],

    // No database here — saroh.app renders via api.saroh.in (single backend).
    reactStrictMode: false,

    // No `X-Powered-By: Next.js`: it only tells scanners what to try.
    poweredByHeader: false,

    // Every response gets SECURITY_HEADERS. An invoice pay link's token is its
    // credential (ADR-007, U13): the page sends no referrer and is never
    // indexed, as headers as well as meta tags.
    async headers() {
        return [
            { source: "/:path*", headers: SECURITY_HEADERS },
            {
                source: "/pay/:token*",
                headers: [
                    { key: "Referrer-Policy", value: "no-referrer" },
                    { key: "X-Robots-Tag", value: "noindex, nofollow" },
                    { key: "Cache-Control", value: "no-store" },
                ],
            },
            // A test release's host (DEC-071, R3), every response, assets
            // included: never indexed, and no referrer, so the page's address
            // never travels to another site. The middleware sets the same on
            // what it answers itself (`lib/test-host.ts`). By shape, as the
            // host classifier (`lib/site-host-mode.ts`): `test--<address>.*`
            // and `test.<custom domain>`.
            ...TEST_HOST_PATTERNS.map((value) => ({
                source: "/:path*",
                has: [{ type: "host", value }],
                headers: [
                    { key: "X-Robots-Tag", value: "noindex, nofollow" },
                    { key: "Referrer-Policy", value: "no-referrer" },
                ],
            })),
        ];
    },

    images: {
        domains: [
            "public.blob.vercel-storage.com",
            "res.cloudinary.com",
            "abs.twimg.com",
            "pbs.twimg.com",
            "avatars.githubusercontent.com",
            "www.google.com",
            "flag.vercel.app",
            "illustrations.popsy.co",
            "lh3.googleusercontent.com",
        ],
    },
};

module.exports = nextConfig;
