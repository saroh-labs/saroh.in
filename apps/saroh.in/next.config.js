/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui"],

    // No database here — saroh.in is the public marketing site (single backend
    // lives at api.saroh.in).
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
