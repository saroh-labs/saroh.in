import { describe, expect, it } from "vitest";

import { fieldLabel } from "./labels";

describe("fieldLabel (UX-065)", () => {
    it("uses the API's words", () => {
        expect(fieldLabel({ slug: "Web address" }, "slug")).toBe("Web address");
    });

    it("never shows a raw key when the API sends no label", () => {
        expect(fieldLabel(undefined, "firstName")).toBe("First name");
        expect(fieldLabel({}, "zipCode")).toBe("Zip code");
        expect(fieldLabel({}, "gst_rate")).toBe("Gst rate");
    });
});
