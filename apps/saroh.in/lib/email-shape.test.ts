import { describe, expect, it } from "vitest";

import { isEmailShape, shapedEmail } from "./email-shape";

describe("isEmailShape", () => {
    it.each(["name@shop.in", "a.b+c@mail.co.in", "x@y.z"])("takes %s", (v) => {
        expect(isEmailShape(v)).toBe(true);
    });

    it.each([
        "",
        "name",
        "name@shop",
        "name@.in",
        "name@shop..in",
        "name@shop.",
        "a b@shop.in",
        "a@b@shop.in",
    ])("refuses %j", (v) => {
        expect(isEmailShape(v)).toBe(false);
    });

    it("answers a long run of dots at once (no polynomial backtracking)", () => {
        const start = performance.now();
        expect(isEmailShape(`a@${".".repeat(50_000)}`)).toBe(false);
        expect(performance.now() - start).toBeLessThan(200);
    });
});

describe("shapedEmail", () => {
    it("trims a good email and refuses the rest", () => {
        expect(shapedEmail("  name@shop.in ")).toBe("name@shop.in");
        expect(shapedEmail("name@shop")).toBeNull();
    });
});
