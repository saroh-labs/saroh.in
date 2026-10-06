import { defineConfig } from "vitest/config";

/** help.saroh.in's unit tests: the move to saroh.in/help. */
export default defineConfig({
    test: {
        environment: "node",
        include: ["*.test.ts", "lib/**/*.test.ts"],
    },
});
