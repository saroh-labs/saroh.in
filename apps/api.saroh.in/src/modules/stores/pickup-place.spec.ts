import { pickupPlaceOf, waysWithPlace } from "./pickup-place";

/** Pick-up needs a place customers visit, with its address (UX-025). */
describe("pickupPlaceOf", () => {
    it("is a place customers visit that has an address", () => {
        expect(
            pickupPlaceOf({
                kind: "SHOP",
                address: "  12 Hill Road  ",
                openingHours: [
                    {
                        day: "MON",
                        open: "10:00",
                        close: "19:00",
                        closed: false,
                    },
                ],
            }),
        ).toEqual({
            address: "12 Hill Road",
            hours: "Mon 10:00–19:00, Tue–Sun closed",
        });
    });

    it("is none for a No counter place, or one with no address", () => {
        expect(
            pickupPlaceOf({ kind: "ONLINE", address: "12 Hill Road" }),
        ).toBeNull();
        expect(pickupPlaceOf({ kind: "SHOP", address: "   " })).toBeNull();
        expect(pickupPlaceOf({ kind: "SHOP", address: null })).toBeNull();
        expect(pickupPlaceOf(null)).toBeNull();
    });
});

describe("waysWithPlace", () => {
    it("drops Pick-up when there is nowhere to collect from", () => {
        expect(waysWithPlace(["PICKUP", "SHIPPING"], null)).toEqual([
            "SHIPPING",
        ]);
        expect(
            waysWithPlace(["PICKUP", "SHIPPING"], {
                address: "12 Hill Road",
                hours: null,
            }),
        ).toEqual(["PICKUP", "SHIPPING"]);
    });
});
