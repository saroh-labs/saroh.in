import { trimTrailingSlashes } from "./paths";

describe("trimTrailingSlashes", () => {
    it("drops every trailing slash and keeps the rest", () => {
        expect(trimTrailingSlashes("/book///")).toBe("/book");
        expect(trimTrailingSlashes("/a//b/")).toBe("/a//b");
        expect(trimTrailingSlashes("/shop")).toBe("/shop");
        expect(trimTrailingSlashes("///")).toBe("");
        expect(trimTrailingSlashes("")).toBe("");
    });

    it("stays fast on a long run of slashes that doesn't end the path", () => {
        const input = `${"/".repeat(100_000)}x`;
        const started = Date.now();
        expect(trimTrailingSlashes(input)).toBe(input);
        expect(Date.now() - started).toBeLessThan(50);
    });
});
