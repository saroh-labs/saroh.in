import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * The console's unit and component tests (plans catalogue U6). The app had
 * no runner before the Plans & modules screen, whose draft store and status
 * bar carry rules worth pinning: what starts a draft, what a refused save
 * says, which tab a link opens.
 *
 * `node` by default; a component test opts into jsdom with a
 * `@vitest-environment jsdom` comment. Layout, focus across the page and the
 * four scenes need a real browser, which is `e2e/`.
 *
 * `@saroh/pricing-catalog` (and its `/seed` entry, which the first-run
 * screen's starter catalogue reads) resolves to its source, so a test never
 * depends on a `dist` someone forgot to build.
 */
export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^@saroh\/pricing-catalog\/seed$/,
                replacement: path.resolve(
                    __dirname,
                    "../../packages/pricing-catalog/src/seed.ts",
                ),
            },
            {
                find: /^@saroh\/pricing-catalog$/,
                replacement: path.resolve(
                    __dirname,
                    "../../packages/pricing-catalog/src/index.ts",
                ),
            },
            { find: "@", replacement: path.resolve(__dirname) },
        ],
    },
    esbuild: { jsx: "automatic" },
    test: {
        environment: "node",
        globals: true,
        include: ["lib/**/*.test.ts", "components/**/*.test.{ts,tsx}"],
    },
});
