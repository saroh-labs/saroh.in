const { REDIRECTS, temporary } = require("./redirects");
const { builtRoutes } = require("./routes.config");

// A production deployment without API_URL drops every waitlist join, and
// nothing on the page shows it: refuse to build instead (it went unseen for
// two days after Gate W, DEV_LEARNINGS). Without SITE_RELAY_SECRET joins go
// through but the API rate-limits every visitor as one. Other previews and
// local builds may go without; the waitlist says so there.
const REQUIRED_IN_PRODUCTION = ["API_URL", "SITE_RELAY_SECRET"];

// The `development` branch's deployments are the dev environment (saroh.io).
// They need everything production does, or they would quietly talk to
// production, plus the key that keeps them private.
const REQUIRED_IN_DEVELOPMENT = [
    ...REQUIRED_IN_PRODUCTION,
    "DEV_ACCESS_KEY",
    "DEV_ACCESS_COOKIE_DOMAIN",
    "DEV_REDIRECT_ORIGIN",
];
const required =
    process.env.VERCEL_ENV === "production"
        ? REQUIRED_IN_PRODUCTION
        : process.env.VERCEL_GIT_COMMIT_REF === "development"
          ? REQUIRED_IN_DEVELOPMENT
          : [];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
    throw new Error(
        `saroh.in: ${missing.join(", ")} must be set for a ${process.env.VERCEL_ENV === "production" ? "production" : "development"} deployment (the waitlist relays to the API).`,
    );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui"],

    // No database here — saroh.in is the public marketing site (single backend
    // lives at api.saroh.in).
    reactStrictMode: false,

    /**
     * The pages this build has, read from `app/` as it is built
     * (`routes.config.js`). The Resources list (`content/resources.ts`) shows a
     * page in the nav, footer and sitemap only once its route is here, so a
     * page listed ahead of its route never links to a 404.
     */
    env: {
        SAROH_BUILT_ROUTES: JSON.stringify(builtRoutes()),
    },

    /*
     * A pricing draft preview (plans catalogue U24, KTD-10) is never cached,
     * indexed or passed on as a referrer, whatever the page itself sends.
     */
    async headers() {
        const preview = [
            { key: "Cache-Control", value: "no-store" },
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
            { key: "Referrer-Policy", value: "no-referrer" },
        ];
        return [
            { source: "/pricing/draft", headers: preview },
            { source: "/pricing/preview", headers: preview },
        ];
    },

    /**
     * Old addresses to their V2 pages, one hop each, and, before launch,
     * Pricing to the waitlist (`redirects.js`).
     */
    async redirects() {
        return [
            ...REDIRECTS,
            ...temporary(process.env.NEXT_PUBLIC_LAUNCH_MODE),
        ];
    },

    images: {
        domains: [
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
