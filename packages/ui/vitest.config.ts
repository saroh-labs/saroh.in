import { defineConfig } from "vitest/config";

/**
 * Component tests for @saroh/ui.
 *
 * The workspace had no frontend test harness at all, so the product states
 * (#177) — the ones §30 calls part of the product — had nothing pinning them.
 * These specs assert the DISTINCTIONS rather than the styling: that a failed
 * state is announced as an alert and an empty one is not, that loading is
 * marked busy, that no state depends on colour alone to be told apart.
 *
 * What this cannot cover is the four scenes (§18) — dark, bright ambient
 * light, 320px and one-handed reach need a real browser against a running
 * stack. That harness is tracked separately.
 */
export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.test.tsx"],
    },
});
