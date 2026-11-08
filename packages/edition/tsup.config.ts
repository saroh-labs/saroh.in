import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // As @saroh/block-contract: a watcher that wipes dist on start leaves
    // consumers resolving the package to nothing.
    clean: !options.watch,
    dts: true,
    // address-rules is its own entry, with no imports: block-contract
    // re-exports it for site blocks, which mustn't pull in ibantools.
    entry: ["src/index.ts", "src/address-rules.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
