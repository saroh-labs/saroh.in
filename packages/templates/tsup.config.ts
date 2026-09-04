import { defineConfig } from "tsup";

export default defineConfig((options) => ({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    target: "es2022",
    // A watcher that wipes dist on start leaves every consumer compiling in that
    // window — nest --watch in api, for one — resolving `@saroh/*` to nothing,
    // and it does not re-resolve. Clean only on a one-off build.
    clean: !options.watch,
    minify: true,
}));
