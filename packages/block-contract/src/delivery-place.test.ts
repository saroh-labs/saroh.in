import { describe, expect, it } from "vitest";

import { joinDeliveryPlace, splitDeliveryPlace } from "./delivery-place";

describe("a Global delivery's region and country on one line", () => {
    it("joins what it has", () => {
        expect(joinDeliveryPlace(" Texas ", "us")).toBe("Texas, United States");
        expect(joinDeliveryPlace("", "AE")).toBe("United Arab Emirates");
        expect(joinDeliveryPlace("Texas", null)).toBe("Texas");
    });

    it("comes apart again, a US state named like a country included", () => {
        expect(splitDeliveryPlace("Georgia, United States")).toEqual({
            region: "Georgia",
            country: "US",
        });
        expect(splitDeliveryPlace("United Kingdom")).toEqual({
            region: "",
            country: "GB",
        });
        expect(splitDeliveryPlace("Somewhere")).toEqual({
            region: "Somewhere",
            country: null,
        });
        expect(splitDeliveryPlace(null)).toEqual({ region: "", country: null });
    });
});
