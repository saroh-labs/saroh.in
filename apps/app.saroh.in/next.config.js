// A production deployment that falls back to built-in addresses talks to
// whatever the code assumed; one missing variable once dropped every waitlist
// join for two days (DEV_LEARNINGS, 5 Oct 2026). So a Vercel production build
// refuses to start without these (the API and sign-in it talks to). Previews and local builds keep
// their fallbacks (plan 2026-10-05-001 KTD-3).
const REQUIRED_IN_PRODUCTION = [
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_ACCOUNTS_URL",
    "NEXT_PUBLIC_BETTER_AUTH_URL",
];
if (process.env.VERCEL_ENV === "production") {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `app.saroh.in: ${missing.join(", ")} must be set for a production deployment.`,
        );
    }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@saroh/auth", "@saroh/ui", "@saroh/site-blocks"],
    // No Prisma externalization here: this app has no @prisma/* dependency and
    // imports no database code — every read and write goes to api.saroh.in over
    // HTTP (enforced by the DB-import ban in @saroh/eslint-config/nextjs).
    reactStrictMode: false,
    /*
     * Auto-memoization, so a component does not depend on somebody having
     * remembered a `useMemo`. This app is where it pays: 121 client components,
     * and the busiest of them (`DataView`, behind nine screens) recomputes
     * filtered, searched and sorted rows on every keystroke.
     *
     * Not a risk switch. A component the compiler cannot safely memoize is
     * SKIPPED, not broken — those are the "Compilation Skipped" warnings the
     * react-hooks lint rule has been reporting all along, which is also why
     * the codebase was already compiler-clean before this was turned on.
     *
     * Next runs it through Babel, but only over files that actually contain
     * JSX or hooks (an SWC pre-pass decides), so the build cost is localized.
     * `experimental.turbopackRustReactCompiler` is the native port and is
     * faster still — left off until it stops being experimental.
     */
    reactCompiler: true,
    // The dev-tools badge sits in the bottom-left of every screen and was
    // getting baked into the product screenshots used on the marketing site —
    // shipping the product with a development overlay in it. It carries no
    // information this project relies on.
    devIndicators: false,
    // For `forbidden()`, which `getJson` calls on a 403 (lib/api/http.ts,
    // #274). In production Next replaces a server error's message with a
    // digest, so a 403 thrown to error.tsx looks exactly like a 500 there, and
    // the boundary told someone whose role doesn't reach a page to "try again".
    // forbidden() carries the status to its own boundary instead. Still
    // experimental in Next 16.3; see docs/architecture/DEV_LEARNINGS.md.
    experimental: {
        authInterrupts: true,
    },
    /*
     * Sell's Storefronts became Locations (DEC-069, L9). The screens moved to
     * `/commerce/locations`; the old path answers a permanent redirect so a
     * bookmark, an email or an activity line written before the move still
     * lands. The query (`?storefront=<id>`) is carried across. It stays: it
     * costs nothing.
     */
    async redirects() {
        return [
            {
                source: "/commerce/storefronts",
                destination: "/commerce/locations",
                permanent: true,
            },
            {
                source: "/commerce/storefronts/:path*",
                destination: "/commerce/locations/:path*",
                permanent: true,
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
            `${process.env.SPACES_IMAGES_CDN_BASE_URL}`,
        ],
    },
};

module.exports = nextConfig;
