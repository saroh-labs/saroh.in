import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const { builtRoutes } = createRequire(import.meta.url)(
    "./routes.config.js",
) as {
    builtRoutes: (root?: string) => string[];
};

describe("builtRoutes (next.config.js → SAROH_BUILT_ROUTES)", () => {
    it("lists this app's pages with route groups dropped", () => {
        const routes = builtRoutes(path.join(__dirname, "app"));
        expect(routes).toContain("/");
        expect(routes).toContain("/features/[slug]");
        expect(routes).toContain("/waitlist");
        expect(routes).toContain("/changelog");
        expect(routes).toContain("/changelog/[slug]");
        expect(routes).toContain("/privacy");
        expect(routes.some((r) => r.includes("("))).toBe(false);
        expect(routes.some((r) => r.startsWith("/api"))).toBe(false);
    });
});
