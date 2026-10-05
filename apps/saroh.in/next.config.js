const { REDIRECTS, TEMPORARY } = require("./redirects");

// A production deployment without API_URL drops every waitlist join, and
// nothing on the page shows it: refuse to build instead (it went unseen for
// two days after Gate W, DEV_LEARNINGS). Previews and local builds may go
// without; the waitlist says so there.
if (process.env.VERCEL_ENV === "production" && !process.env.API_URL) {
    throw new Error(
        "saroh.in: API_URL must be set for a production deployment (the waitlist relays to it).",
    );
}

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
