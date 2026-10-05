// A production deployment that falls back to built-in addresses talks to
// whatever the code assumed; one missing variable once dropped every waitlist
// join for two days (DEV_LEARNINGS, 5 Oct 2026). So a Vercel production build
// refuses to start without these (the API it signs people in with and the app it sends them to). Previews and local builds keep
// their fallbacks (plan 2026-10-05-001 KTD-3).
const REQUIRED_IN_PRODUCTION = [
    "NEXT_PUBLIC_BETTER_AUTH_URL",
    "NEXT_PUBLIC_ACCOUNTS_URL",
    "NEXT_PUBLIC_APP_URL",
];
if (process.env.VERCEL_ENV === "production") {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `accounts.saroh.in: ${missing.join(", ")} must be set for a production deployment.`,
        );
    }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
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
