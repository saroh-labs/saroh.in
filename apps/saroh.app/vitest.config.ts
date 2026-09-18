import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the merchant-site app's `lib/` (code review of #322).
 *
 * `node`, like app.saroh.in's runner: what is covered here is logic, the
 * shape checks on public API responses that decide whether a merchant's page
 * draws its error state or breaks. The pages themselves need a real browser,
 * which is `e2e/`.
 */
export default defineConfig({
    resolve: {
        alias: { "@": path.resolve(__dirname) },
    },
    test: {
        environment: "node",
        globals: true,
        include: ["lib/**/*.test.ts"],
    },
});
