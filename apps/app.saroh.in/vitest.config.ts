import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the workspace app's `lib/` (#287).
 *
 * The app had no test runner at all, so the modules every screen leans on —
 * the 403/404 mapping that decides whether a failure is explained or offered a
 * retry, the editor preferences a merchant's layout is restored from — had
 * nothing pinning them.
 *
 * `node`, not `jsdom`: what is covered here is logic, not components. The
 * components' own states are pinned in `@saroh/ui`, and the four scenes need a
 * real browser, which is `e2e/`. A runner that claims more than it does invites
 * the next person to stop looking.
 */
export default defineConfig({
    resolve: {
        // The same `@/` the app imports by, so a test reads like the code.
        alias: { "@": path.resolve(__dirname) },
    },
    test: {
        environment: "node",
        globals: true,
        include: ["lib/**/*.test.ts"],
    },
});
