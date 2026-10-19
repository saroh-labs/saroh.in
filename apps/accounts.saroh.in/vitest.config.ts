import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the sign-in app's `lib/` and its copy (UX audit, 10 Oct).
 *
 * The app had no runner, so the rules its screens lean on had nothing pinning
 * them: where a sign-in lands, what a failure says, which state a failed
 * invitation read is, and that nothing a person reads says "Log in".
 *
 * `node` by default: most of what is covered is logic and words. The
 * account area's screens (Billing profiles, DEC-167 step 2) are drawn in
 * `jsdom`, which each of those tests asks for itself; the pages against
 * the running stack are `e2e/`.
 */
export default defineConfig({
    resolve: {
        // The same `@/` the app imports by, so a test reads like the code.
        alias: { "@": path.resolve(__dirname) },
    },
    test: {
        environment: "node",
        globals: true,
        // jsdom's gaps a drawn component meets (`:modal`, ResizeObserver,
        // scrollIntoView), as app.saroh.in's.
        setupFiles: ["./vitest.setup.ts"],
        // A sheet's first open in jsdom loads the phone field's country
        // picker (#1036); on a busy CI runner that alone passed 5s while
        // the file took 1s locally.
        testTimeout: 15_000,
        include: [
            "lib/**/*.test.ts",
            "components/**/*.test.ts",
            "components/**/*.test.tsx",
        ],
    },
});
