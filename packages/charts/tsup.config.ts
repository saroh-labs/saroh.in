/* eslint-disable @typescript-eslint/no-shadow -- no*/
/* eslint-disable import/no-default-export -- no */
/* eslint-disable @typescript-eslint/consistent-type-imports -- no  */
import { defineConfig, Options } from "tsup";

export default defineConfig((options: Options) => ({
    entry: ["src/**/*.tsx"],
    format: ["esm", "cjs"],
    esbuildOptions(options) {
        options.banner = {
            js: '"use client"',
        };
    },
    dts: true,
    target: "es2019",
    // A watcher that wipes dist on start leaves every consumer compiling in that
    // window — nest --watch in api, for one — resolving `@saroh/*` to nothing,
    // and it does not re-resolve. Clean only on a one-off build.
    clean: !options.watch,
    minify: true,
    external: ["react"],
    ...options,
}));
