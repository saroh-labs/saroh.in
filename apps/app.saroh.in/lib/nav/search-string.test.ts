import { describe, expect, it } from "vitest";

import { searchString } from "./search-string";

describe("searchString", () => {
    it("is empty with no params", () => {
        expect(searchString({})).toBe("");
        expect(searchString({ view: undefined })).toBe("");
    });

    it("keeps every value, repeated keys included", () => {
        expect(searchString({ subscribe: "1", tag: ["a", "b"] })).toBe(
            "?subscribe=1&tag=a&tag=b",
        );
    });
});
