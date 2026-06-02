/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/auth ships its client/middleware/next entries as source.
    transpilePackages: ["@saroh/auth"],
    // Prisma 7 uses the @prisma/adapter-pg driver adapter (no binary query
    // engine), so externalizing the packages is enough — no webpack
    // PrismaPlugin needed, and the default Turbopack build works.
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma"],
};

export default nextConfig;
