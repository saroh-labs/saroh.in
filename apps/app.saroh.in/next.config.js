/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@saroh/auth", "@saroh/ui"],
    // No Prisma externalization here: this app has no @prisma/* dependency and
    // imports no database code — every read and write goes to api.saroh.in over
    // HTTP (enforced by the DB-import ban in @saroh/eslint-config/nextjs).
    reactStrictMode: false,
    // The dev-tools badge sits in the bottom-left of every screen and was
    // getting baked into the product screenshots used on the marketing site —
    // shipping the product with a development overlay in it. It carries no
    // information this project relies on.
    devIndicators: false,
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
