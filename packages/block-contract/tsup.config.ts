import { defineConfig } from "tsup";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig((options) => ({
    // Same reasoning as @saroh/database: a watcher that wipes dist on start
    // leaves every consumer resolving `@saroh/block-contract` to nothing for
    // that window, and they do not re-resolve. Clean only on a one-off build.
    clean: !options.watch,
    dts: true,
    // `phone` on its own too: the phone field in the browser needs only it,
    // and the whole contract brings zod along (`@saroh/block-contract/phone`).
    entry: ["src/index.ts", "src/phone.ts"],
    format: ["cjs", "esm"],
    minify: isProduction,
    sourcemap: true,
}));
