// A production deployment that falls back to built-in addresses talks to
// whatever the code assumed; one missing variable once dropped every waitlist
// join for two days (DEV_LEARNINGS, 5 Oct 2026). So a Vercel production build
// refuses to start without these (the API and sign-in it talks to). Previews and local builds keep
// their fallbacks (plan 2026-10-05-001 KTD-3).
const REQUIRED_IN_PRODUCTION = [
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_ACCOUNTS_URL",
    "NEXT_PUBLIC_BETTER_AUTH_URL",
];
if (process.env.VERCEL_ENV === "production") {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `admin.saroh.in: ${missing.join(", ")} must be set for a production deployment.`,
        );
    }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/auth ships its client/middleware/next entries as source. admin no
    // longer touches the database — it reads the session over HTTP from
    // api.saroh.in via @saroh/auth/next — so no Prisma externalization needed.
    // Both ship their entries as source rather than a build, so Next has to
    // compile them: @saroh/auth (client/middleware/next) and @saroh/ui (the
    // shared component library — see its source-only consumption contract).
    transpilePackages: ["@saroh/auth", "@saroh/ui"],
};

export default nextConfig;
