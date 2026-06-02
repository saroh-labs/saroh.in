/** @type {import('next').NextConfig} */
const nextConfig = {
    // Prisma 7 driver adapter — externalize, no webpack PrismaPlugin needed.
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "prisma"],
    reactStrictMode: false,

    images: {
        domains: [
            "public.blob.vercel-storage.com",
            "res.cloudinary.com",
            "abs.twimg.com",
            "pbs.twimg.com",
            "avatars.githubusercontent.com",
            "www.google.com",
            "flag.vercel.app",
            "illustrations.popsy.co",
            "lh3.googleusercontent.com",
        ],
    },
    async rewrites() {
        return [
            {
                source: "/ecommerce",
                destination: "http://localhost:3006/ecommerce",
            },
            {
                source: "/ecommerce/:path*",
                destination: "http://localhost:3006/ecommerce/:path*",
            },
        ];
    },
};

module.exports = nextConfig;
