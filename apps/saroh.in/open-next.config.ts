import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The site is static (app/layout.tsx): every page is built at deploy time and
// served from the build, never regenerated (a Worker can neither read
// content/ nor compile MDX while serving). This read-only cache serves the
// prerendered pages from Workers Static Assets.
export default defineCloudflareConfig({
    incrementalCache: staticAssetsIncrementalCache,
    enableCacheInterception: true,
});
