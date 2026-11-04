/**
 * saroh.tech is plain static HTML (`next build` writes `out/`), served as
 * Workers static assets. So no Next server, image optimiser, redirects or
 * headers: `worker/index.ts` does what must happen at the edge.
 *
 * `*.dev.tsx` routes (the components sheet) exist only under `next dev`.
 */
const dev = process.env.NODE_ENV !== "production";

/** @type {import("next").NextConfig} */
export default {
    output: "export",
    trailingSlash: false,
    images: { unoptimized: true },
    poweredByHeader: false,
    pageExtensions: dev ? ["dev.tsx", "tsx", "ts"] : ["tsx", "ts"],
    transpilePackages: ["@saroh/ui", "@saroh/marketing"],
};
