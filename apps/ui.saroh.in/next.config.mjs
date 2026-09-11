/** @type {import('next').NextConfig} */
const nextConfig = {
    // @saroh/ui is consumed as source (no built dist); Next must transpile it
    // for a webpack `next build`. @saroh/auth and @saroh/site-blocks likewise
    // ship as source.
    transpilePackages: ["@saroh/auth", "@saroh/ui", "@saroh/site-blocks"],

    /*
     * The dev indicator is off because this app renders block previews in
     * IFRAMES, and Next draws one in every document — so a catalog page showing
     * one block in three palettes at two widths came with six floating badges,
     * each sitting on top of the block it was meant to be showing.
     *
     * A catalog is a tool for looking at things closely. Anything drawn over
     * the thing being looked at defeats it.
     */
    devIndicators: false,
};

export default nextConfig;
