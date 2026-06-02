/** @type {import('next').NextConfig} */
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig = {
    turbopack: {}, // Silence webpack/turbopack config warning
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma"],
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.plugins = [...config.plugins, new PrismaPlugin()];
        }

        return config;
    },
};
export default nextConfig;
