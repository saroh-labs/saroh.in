/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {},
    // @saroh/auth/client ships as source (sidesteps a bundled-dts portability
    // issue) so Next must transpile it, like the other workspace UI packages.
    transpilePackages: ["@saroh/auth"],
    // Prisma 7 uses the @prisma/adapter-pg driver adapter (no binary query
    // engine), so externalizing the packages is enough — no webpack
    // PrismaPlugin needed, and the default Turbopack build works.
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma"],
};
export default nextConfig;
