/** @type {import('next').NextConfig} */
const nextConfig = {
    // CI caps Next's build workers: os.cpus() ignores a runner's CPU limit (ci.yml).
    experimental: {
        ...(process.env.NEXT_BUILD_CPUS && {
            cpus: Number(process.env.NEXT_BUILD_CPUS),
        }),
    },
    basePath: "/ecommerce",
    transpilePackages: ["@saroh/auth", "@saroh/ui"],
};

export default nextConfig;
