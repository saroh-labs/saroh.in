/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/auth ships its client/middleware/next entries as source. admin no
    // longer touches the database — it reads the session over HTTP from
    // api.saroh.in via @saroh/auth/next — so no Prisma externalization needed.
    transpilePackages: ["@saroh/auth"],
};

export default nextConfig;
