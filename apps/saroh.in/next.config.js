const { REDIRECTS } = require("./redirects");

/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui"],

    // No database here — saroh.in is the public marketing site (single backend
    // lives at api.saroh.in).
    reactStrictMode: false,

    /*
     * A pricing draft preview (plans catalogue U24, KTD-10) is never cached,
     * indexed or passed on as a referrer, whatever the page itself sends.
     */
    async headers() {
        const preview = [
            { key: "Cache-Control", value: "no-store" },
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
            { key: "Referrer-Policy", value: "no-referrer" },
        ];
        return [
            { source: "/pricing/draft", headers: preview },
            { source: "/pricing/preview", headers: preview },
        ];
    },

    /** Old addresses to their V2 pages, one hop each (`redirects.js`). */
    async redirects() {
        return REDIRECTS;
    },

    images: {
        domains: [
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
