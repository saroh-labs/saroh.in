// A production deployment that falls back to built-in addresses talks to
// whatever the code assumed; one missing variable once dropped every waitlist
// join for two days (DEV_LEARNINGS, 5 Oct 2026). So a production build (`VERCEL_ENV`,
// set by the Worker's wrangler.jsonc)
// refuses to start without these (the API it signs people in with and the app it sends them to). Other previews and local builds
// keep their fallbacks (plan 2026-10-05-001 KTD-3).
const REQUIRED_IN_PRODUCTION = [
    "NEXT_PUBLIC_BETTER_AUTH_URL",
    "NEXT_PUBLIC_ACCOUNTS_URL",
    "NEXT_PUBLIC_APP_URL",
];

// The `development` branch's deployments are the dev environment (saroh.io).
// They need everything production does, or they would quietly talk to
// production, plus the key that keeps them private and their own session cookie.
const REQUIRED_IN_DEVELOPMENT = [
    ...REQUIRED_IN_PRODUCTION,
    "DEV_ACCESS_KEY",
    "DEV_ACCESS_COOKIE_DOMAIN",
    "DEV_REDIRECT_ORIGIN",
    "AUTH_COOKIE_PREFIX",
    "BETTER_AUTH_TRUSTED_ORIGINS",
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
        `accounts.saroh.in: ${missing.join(", ")} must be set for a ${process.env.VERCEL_ENV === "production" ? "production" : "development"} deployment.`,
    );
}

// Every response: HTTPS only from the first visit on, never shown inside
// another site's frame (so a sign-in or a button can't be dressed up and
// clicked through from elsewhere), and no guessing a file's type. The app's
// own previews are same-origin, so 'self' may still frame it.
const SECURITY_HEADERS = [
    {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
    },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    // No `X-Powered-By: Next.js`: it only tells scanners what to try.
    poweredByHeader: false,
    async headers() {
        return [{ source: "/:path*", headers: SECURITY_HEADERS }];
    },
    // Development logs every server action's arguments by default, and some
    // carry secrets: provider keys, sign-in codes (UX-005, 7 Oct). Production
    // never logs them; this keeps local logs clean too.
    logging: { serverFunctions: false },
    turbopack: {},
    // @saroh/auth/client and @saroh/ui both ship as source (no built dist), so
    // Next must transpile them — required for a webpack `next build`, not just
    // the Turbopack dev/build path which auto-transpiles workspace source.
    transpilePackages: ["@saroh/auth", "@saroh/ui"],
    // No Prisma externalization here: this app has no @prisma/* dependency and
    // talks to Better Auth over HTTP against api.saroh.in (see env.ts), which
    // is the only service that touches the database.
};
export default nextConfig;
