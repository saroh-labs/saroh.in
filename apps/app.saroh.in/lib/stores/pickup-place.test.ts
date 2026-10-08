import { describe, expect, it } from "vitest";

import { pickupNotOffered } from "./pickup-place";

/** Pick-up needs a place customers visit, with its address (UX-025). */
describe("pickupNotOffered", () => {
    it("says nothing for a place customers visit that has an address", () => {
        expect(
            pickupNotOffered({
                kind: "SHOP",
                address: "12 Hill Road",
                fulfilmentTypes: ["PICKUP"],
            }),
        ).toBeNull();
    });

    it("says nothing when the location doesn't offer Pick-up", () => {
        expect(
            pickupNotOffered({
                kind: "ONLINE",
                address: null,
                fulfilmentTypes: ["SHIPPING"],
            }),
        ).toBeNull();
    });

    it("says why a No counter location's Pick-up isn't on the website", () => {
        expect(
            pickupNotOffered({
                kind: "ONLINE",
                address: null,
                fulfilmentTypes: ["PICKUP"],
            }),
        ).toMatch(
            /^Your website doesn't offer Pick-up from here: pick-up needs a place customers visit, with its address/,
        );
    });

    it("asks for the address of a place customers visit without one", () => {
        expect(
            pickupNotOffered({
                kind: "SHOP",
                address: "  ",
                fulfilmentTypes: ["PICKUP"],
            }),
        ).toMatch(/add this location's address/);
    });
});
