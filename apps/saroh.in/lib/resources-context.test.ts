import { describe, expect, it } from "vitest";

import {
    parseBuiltAt,
    parseBuiltRoutes,
    previewOn,
    templatesOn,
} from "./resources-context";

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

describe("templatesOn (NEXT_PUBLIC_TEMPLATES, DEC-135)", () => {
    it("is off when unset in a built site, so production shows no templates", () => {
        expect(templatesOn(undefined, "production")).toBe(false);
        expect(templatesOn(undefined, "test")).toBe(false);
        expect(templatesOn(undefined, undefined)).toBe(false);
    });

    it("is on only when it says on", () => {
        expect(templatesOn("on", "production")).toBe(true);
        expect(templatesOn("off", "production")).toBe(false);
        expect(templatesOn("true", "production")).toBe(false);
    });

    it("unset counts as on under next dev, and off still hides there", () => {
        expect(templatesOn(undefined, "development")).toBe(true);
        expect(templatesOn("off", "development")).toBe(false);
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

describe("parseBuiltAt (SAROH_BUILT_AT)", () => {
    it("reads the moment next.config.js stamps the build with", () => {
        expect(parseBuiltAt("2026-10-16T18:31:00.000Z")?.toISOString()).toBe(
            "2026-10-16T18:31:00.000Z",
        );
    });

    it("is null, not a guess, when unset or unreadable", () => {
        expect(parseBuiltAt(undefined)).toBeNull();
        expect(parseBuiltAt("")).toBeNull();
        expect(parseBuiltAt("yesterday")).toBeNull();
    });
});
