import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // As @saroh/block-contract: a watcher that wipes dist on start leaves
    // consumers resolving the package to nothing. Clean only on a one-off build.
    clean: !options.watch,
    dts: true,
    entry: ["src/index.ts", "src/seed.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
