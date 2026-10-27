import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        // CI's runners are several times slower than a laptop: whole pages
        // with lazily loaded tools timed out there at the defaults (27 Oct).
        testTimeout: 30_000,
        setupFiles: ["./vitest.setup.ts"],
    },
});
