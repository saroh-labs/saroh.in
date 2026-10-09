import { describe, expect, it } from "vitest";

import { pageUpdatedIso, postUpdatedIso } from "@/lib/sites/updated";

describe("Updated dates (#908)", () => {
    it("dates a post by its last change, not when it went out", () => {
        expect(
            postUpdatedIso({
                createdAt: "2026-03-01T09:00:00Z",
                updatedAt: "2026-10-08T07:30:00Z",
            }),
        ).toBe("2026-10-08T07:30:00Z");
    });

    it("falls back to a post's creation from an older API", () => {
        expect(postUpdatedIso({ createdAt: "2026-03-01T09:00:00Z" })).toBe(
            "2026-03-01T09:00:00Z",
        );
    });

    it("says nothing for a page an older API didn't date", () => {
        expect(pageUpdatedIso({})).toBeNull();
        expect(pageUpdatedIso({ updatedAt: "2026-10-08T07:30:00Z" })).toBe(
            "2026-10-08T07:30:00Z",
        );
    });
});
