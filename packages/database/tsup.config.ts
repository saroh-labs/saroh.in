import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // A watcher that wipes dist on start leaves every consumer compiling in that
    // window — nest --watch in api, for one — resolving `@saroh/*` to nothing,
    // and it does not re-resolve. Clean only on a one-off build.
    clean: !options.watch,
    dts: true,
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
