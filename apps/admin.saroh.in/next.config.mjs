/** @type {import('next').NextConfig} */
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig = {
    // @saroh/auth ships its client/middleware/next entries as source.
    transpilePackages: ["@saroh/auth"],
    // The server getServerSession path builds the Prisma-backed instance.
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma"],
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.plugins = [...config.plugins, new PrismaPlugin()];
        }
        return config;
    },
};

export default nextConfig;
