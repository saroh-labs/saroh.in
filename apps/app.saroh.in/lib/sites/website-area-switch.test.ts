import { describe, expect, it } from "vitest";

import { websiteAreaOnFor } from "./website-area-switch";

/** The Website area's switch: off unless NEXT_PUBLIC_WEBSITE_AREA says on. */
describe("websiteAreaOnFor (NEXT_PUBLIC_WEBSITE_AREA)", () => {
    it("is off when unset in a built app, as production", () => {
        expect(websiteAreaOnFor(undefined, "production")).toBe(false);
        expect(websiteAreaOnFor(undefined, "test")).toBe(false);
    });

    it("is on only when it says on", () => {
        expect(websiteAreaOnFor("on", "production")).toBe(true);
        expect(websiteAreaOnFor("off", "production")).toBe(false);
    });

    it("unset counts as on under next dev, and off still hides there", () => {
        expect(websiteAreaOnFor(undefined, "development")).toBe(true);
        expect(websiteAreaOnFor("off", "development")).toBe(false);
    });
});
