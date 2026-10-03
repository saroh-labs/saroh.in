import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * saroh.in's unit tests (plan U18, U19).
 *
 * `node` by default: the content test checks the Marketing Site V2 content
 * model's cross-links (slugs, shot keys) as plain data. The nav, lightbox and
 * menu tests opt into jsdom themselves with a `@vitest-environment` comment,
 * because what they pin is keyboard and focus behaviour.
 */
export default defineConfig({
    resolve: {
        alias: { "@": path.resolve(__dirname) },
    },
    esbuild: { jsx: "automatic" },
    test: {
        environment: "node",
        globals: true,
        include: [
            "content/**/*.test.ts",
            "lib/**/*.test.ts",
            "components/**/*.test.tsx",
            "app/**/*.test.ts",
            "app/**/*.test.tsx",
        ],
    },
});
