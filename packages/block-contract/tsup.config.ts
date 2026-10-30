import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // Same reasoning as @saroh/database: a watcher that wipes dist on start
    // leaves every consumer resolving `@saroh/block-contract` to nothing for
    // that window, and they do not re-resolve. Clean only on a one-off build.
    clean: !options.watch,
    dts: true,
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
