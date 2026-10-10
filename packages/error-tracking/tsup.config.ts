import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // As @saroh/block-contract: a watcher that wipes dist on start leaves
    // consumers resolving the package to nothing. Clean only on a one-off build.
    clean: !options.watch,
    dts: true,
    // Three entries on purpose. `index` is the scrubber and the names, with no
    // network in it; `server` posts to the tracker's capture address with
    // `fetch`; `browser` drives the browser SDK, which the app hands it.
    // Merchant sites (apps/saroh.app, packages/site-blocks) may import the
    // first two only (scripts/check-merchant-site-tracking.mjs).
    entry: ["src/index.ts", "src/server.ts", "src/browser.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
