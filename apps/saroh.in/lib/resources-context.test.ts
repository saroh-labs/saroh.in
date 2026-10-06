import { describe, expect, it } from "vitest";

import { parseBuiltRoutes, previewOn } from "./resources-context";

describe("previewOn (RESOURCES_PREVIEW)", () => {
    it("is never on in production, whatever the flag says", () => {
        expect(previewOn("1", "production")).toBe(false);
        expect(previewOn("true", "production")).toBe(false);
    });

    it("is on for a preview deployment or a local build that asks", () => {
        expect(previewOn("1", "preview")).toBe(true);
        expect(previewOn("TRUE", undefined)).toBe(true);
    });

    it("is off unless asked", () => {
        expect(previewOn(undefined, "preview")).toBe(false);
        expect(previewOn("0", "preview")).toBe(false);
    });
});

describe("parseBuiltRoutes (SAROH_BUILT_ROUTES)", () => {
    it("reads the list next.config.js writes", () => {
        expect(parseBuiltRoutes('["/","/changelog"]')).toEqual([
            "/",
            "/changelog",
        ]);
    });

    it("is null, not a guess, when unset or unreadable", () => {
        expect(parseBuiltRoutes(undefined)).toBeNull();
        expect(parseBuiltRoutes("not json")).toBeNull();
        expect(parseBuiltRoutes('{"a":1}')).toBeNull();
    });
});
