const { REDIRECTS, TEMPORARY } = require("./redirects");

/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui"],

    // No database here — saroh.in is the public marketing site (single backend
    // lives at api.saroh.in).
    reactStrictMode: false,

    /**
     * Old addresses to their V2 pages, one hop each, and pages not published
     * yet to the waitlist (`redirects.js`).
     */
    async redirects() {
        return [...REDIRECTS, ...TEMPORARY];
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
