/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui", "@saroh/site-blocks"],

    // No database here — saroh.app renders via api.saroh.in (single backend).
    reactStrictMode: false,

    // An invoice pay link's token is its credential (ADR-007, U13): the page
    // sends no referrer and is never indexed, as headers as well as meta tags.
    async headers() {
        return [
            {
                source: "/pay/:token*",
                headers: [
                    { key: "Referrer-Policy", value: "no-referrer" },
                    { key: "X-Robots-Tag", value: "noindex, nofollow" },
                    { key: "Cache-Control", value: "no-store" },
                ],
            },
        ];
    },

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
};

module.exports = nextConfig;
