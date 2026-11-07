/**
 * saroh.tech is plain static HTML (`next build` writes `out/`), served as
 * Workers static assets. So no Next server, image optimiser, redirects or
 * headers: `worker/index.ts` does what must happen at the edge.
 *
 * `*.dev.tsx` routes (the components sheet) exist only under `next dev`.
 */
const dev = process.env.NODE_ENV !== "production";
const globalDevDomain = process.env.GLOBAL_DEV_DOMAIN?.trim();
const productionHosts = process.env.GLOBAL_PRODUCTION_HOSTS;

/** @type {import("next").NextConfig} */
export default {
    output: "export",
    trailingSlash: false,
    images: { unoptimized: true },
    poweredByHeader: false,
    pageExtensions: dev ? ["dev.tsx", "tsx", "ts"] : ["tsx", "ts"],
    transpilePackages: ["@saroh/ui", "@saroh/marketing", "@saroh/site-blocks"],
    // A tool's sign-up link is built in the browser, and its address follows
    // the deploy (`site.config.ts`). Only ever set on a deploy.
    env: {
        ...(globalDevDomain && { GLOBAL_DEV_DOMAIN: globalDevDomain }),
        ...(productionHosts && { GLOBAL_PRODUCTION_HOSTS: productionHosts }),
    },
};
