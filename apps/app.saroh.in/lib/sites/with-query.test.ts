import { describe, expect, it } from "vitest";

import { withQuery } from "./with-query";

describe("withQuery", () => {
    it("keeps every value, repeated ones too", () => {
        expect(
            withQuery("/sites/s1/writing", {
                categories: "1",
                tag: ["a", "b"],
            }),
        ).toBe("/sites/s1/writing?categories=1&tag=a&tag=b");
    });

    it("adds nothing when there is no query", () => {
        expect(withQuery("/x", { gone: undefined })).toBe("/x");
    });
});
