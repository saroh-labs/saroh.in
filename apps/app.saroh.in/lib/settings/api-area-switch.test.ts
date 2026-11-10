import { describe, expect, it } from "vitest";

import { apiAreaOnFor } from "./api-area-switch";

/** The API and AI apps area's switch: off unless NEXT_PUBLIC_API_AREA says on. */
describe("apiAreaOnFor (NEXT_PUBLIC_API_AREA)", () => {
    it("is off when unset in a built app, as production", () => {
        expect(apiAreaOnFor(undefined, "production")).toBe(false);
        expect(apiAreaOnFor(undefined, "test")).toBe(false);
    });

    it("is on only when it says on", () => {
        expect(apiAreaOnFor("on", "production")).toBe(true);
        expect(apiAreaOnFor("off", "production")).toBe(false);
    });

    it("unset counts as on under next dev, and off still hides there", () => {
        expect(apiAreaOnFor(undefined, "development")).toBe(true);
        expect(apiAreaOnFor("off", "development")).toBe(false);
    });
});
