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
