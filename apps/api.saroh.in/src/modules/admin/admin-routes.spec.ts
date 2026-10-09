import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every staff controller sits behind `@AdminRoutes()`: sign-in, the staff
 * grant, the per-route permission and the support-access check. A plain
 * `@Controller` here would skip all four, so this fails on one.
 */
describe("admin controllers", () => {
    const files = readdirSync(__dirname).filter((f) =>
        f.endsWith(".controller.ts"),
    );

    it("finds the controllers", () => {
        expect(files.length).toBeGreaterThan(5);
    });

    it.each(files)("%s uses @AdminRoutes() and no bare @Controller", (f) => {
        const source = readFileSync(path.join(__dirname, f), "utf8");
        expect(source).toMatch(/@AdminRoutes\(\)/);
        expect(source).not.toMatch(/@Controller\(/);
    });
});
