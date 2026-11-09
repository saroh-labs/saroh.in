import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": path.resolve(__dirname) } },
    esbuild: { jsx: "automatic" },
    test: {
        environment: "node",
        globals: true,
        include: [
            "lib/**/*.test.ts",
            "worker/**/*.test.ts",
            "scripts/**/*.test.ts",
            "tailwind-content.test.ts",
        ],
        // tailwind-content.test.ts reads @saroh/ui from disk, not by import,
        // so `vitest --changed` (the local gate) only reruns it on a trigger.
        forceRerunTriggers: [
            "**/package.json/**",
            "**/vitest.config.*/**",
            "**/vite.config.*/**",
            "**/packages/ui/src/**",
        ],
    },
});
