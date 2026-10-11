import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the sign-in app's `lib/` and its copy (UX audit, 10 Oct).
 *
 * The app had no runner, so the rules its screens lean on had nothing pinning
 * them: where a sign-in lands, what a failure says, which state a failed
 * invitation read is, and that nothing a person reads says "Log in".
 *
 * `node`, not `jsdom`: what is covered here is logic and words, not
 * components. The shell these pages share is pinned in `@saroh/ui`, and the
 * pages themselves need a real browser against the running stack, which is
 * `e2e/`.
 */
export default defineConfig({
    resolve: {
        // The same `@/` the app imports by, so a test reads like the code.
        alias: { "@": path.resolve(__dirname) },
    },
    test: {
        environment: "node",
        globals: true,
        include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    },
});
