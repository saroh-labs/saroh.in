import { defineConfig } from "tsup";

// Only the server entry is bundled to dist — NestJS (api.saroh.in) needs a
// compiled, server-only artifact with no react in its graph. The browser
// client (./client) is exported as source and transpiled by the consuming
// Next.js app (like @saroh/ui), which also sidesteps the createAuthClient
// "inferred type not portable" (TS2742) issue in bundled dts.
export default defineConfig((options) => ({
    entry: { server: "src/server.ts" },
    format: ["esm", "cjs"],
    dts: true,
    target: "es2019",
    // A watcher that wipes dist on start leaves every consumer compiling in that
    // window — nest --watch in api, for one — resolving `@saroh/*` to nothing,
    // and it does not re-resolve. Clean only on a one-off build.
    clean: !options.watch,
    minify: true,
}));
