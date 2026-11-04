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
    },
});
