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
