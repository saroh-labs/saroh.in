import { describe, expect, it } from "vitest";

import { templatesOn } from "./templates-switch";

/**
 * The template choice's switch (DEC-135): off unless `NEXT_PUBLIC_TEMPLATES`
 * says `on`, so a production build that leaves it out offers no template.
 */
describe("templatesOn (NEXT_PUBLIC_TEMPLATES)", () => {
    it("is off when unset in a built app", () => {
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
