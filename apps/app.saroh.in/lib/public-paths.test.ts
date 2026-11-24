import { describe, expect, it } from "vitest";

import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
    it("opens Saroh Social's deletion status page to anyone", () => {
        expect(isPublicPath("/social/deletion/abc_DEF-123")).toBe(true);
    });

    it("keeps every other page, Social's own among them, behind sign-in", () => {
        for (const path of [
            "/social",
            "/social/new",
            "/social/deletion",
            "/social/deletion/a/b",
            "/",
            // Read routes (DEC-259): each also checks the session itself.
            "/api/orders",
            "/api/probe/list",
            "/api/social/deletion/abc",
        ]) {
            expect(isPublicPath(path), path).toBe(false);
        }
    });
});
