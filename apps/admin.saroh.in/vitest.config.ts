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
 * `@saroh/pricing-catalog` resolves to its source, so a test never depends
 * on a `dist` someone forgot to build.
 */
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname),
            "@saroh/pricing-catalog": path.resolve(
                __dirname,
                "../../packages/pricing-catalog/src/index.ts",
            ),
        },
    },
    esbuild: { jsx: "automatic" },
    test: {
        environment: "node",
        globals: true,
        include: ["lib/**/*.test.ts", "components/**/*.test.{ts,tsx}"],
    },
});
