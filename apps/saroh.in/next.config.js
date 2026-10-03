/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui ships its entries as source, so Next must compile it.
    transpilePackages: ["@saroh/ui"],

    // No database here — saroh.in is the public marketing site (single backend
    // lives at api.saroh.in).
    reactStrictMode: false,

    /*
     * The site before "Saroh Marketing Site" had /modules, /modules/<slug>
     * and /about. Their addresses may be bookmarked or indexed, so each lands
     * on the page that now answers the same question. Payments, messages and
     * automations have no page of their own: they belong to Sell and
     * Contacts, and What it will not do says what is not built.
     */
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

    async redirects() {
        const job = {
            website: "/website",
            commerce: "/sell",
            appointments: "/bookings",
            crm: "/contacts",
            insights: "/insights",
            payments: "/sell",
            communications: "/contacts",
            automations: "/coming-soon",
        };
        return [
            { source: "/modules", destination: "/", permanent: true },
            ...Object.entries(job).map(([slug, destination]) => ({
                source: `/modules/${slug}`,
                destination,
                permanent: true,
            })),
            { source: "/modules/:slug", destination: "/", permanent: true },
            { source: "/about", destination: "/how-it-works", permanent: true },
            {
                source: "/what-it-will-not-do",
                destination: "/coming-soon",
                permanent: true,
            },
        ];
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
