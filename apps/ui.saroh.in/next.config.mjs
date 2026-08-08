/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui is consumed as source (no built dist); Next must transpile it
    // for a webpack `next build`. @saroh/auth likewise ships as source.
    transpilePackages: ["@saroh/auth", "@saroh/ui"],
};

export default nextConfig;
