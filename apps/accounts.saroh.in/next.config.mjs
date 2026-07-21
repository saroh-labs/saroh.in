/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {},
    // @saroh/auth/client and @saroh/ui both ship as source (no built dist), so
    // Next must transpile them — required for a webpack `next build`, not just
    // the Turbopack dev/build path which auto-transpiles workspace source.
    transpilePackages: ["@saroh/auth", "@saroh/ui"],
    // Prisma 7 uses the @prisma/adapter-pg driver adapter (no binary query
    // engine), so externalizing the packages is enough — no webpack
    // PrismaPlugin needed, and the default Turbopack build works.
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma"],
};
export default nextConfig;
