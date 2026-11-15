import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // As @saroh/block-contract: a watcher that wipes dist on start leaves
    // consumers resolving the package to nothing.
    clean: !options.watch,
    dts: true,
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
