import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { placeOfSupply, taxTypeFor } from "../invoices/gst";
import { savedAddressOf } from "./checkout-saved-address";
import { deliveryAddressFor } from "./delivery-address";
import { DeliveryAddressInput } from "./dto";

const INDIA = { edition: "INDIA", country: "IN" } as const;
const UK = { edition: "GLOBAL", country: "GB" } as const;

const home = (over: Partial<DeliveryAddressInput> = {}) =>
    ({
        line1: "14 Hill Road",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400050",
        ...over,
    }) as DeliveryAddressInput;

const refusal = (fn: () => unknown) => {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        return (error as BadRequestException).getResponse();
    }
    throw new Error("Not refused");
};

describe("the body's own shape", () => {
    const errorsOf = (body: object) =>
        validateSync(plainToInstance(DeliveryAddressInput, body));

    it("lets a body with no state or postcode through to the business's rule", () => {
        expect(errorsOf({ line1: "1 Main St", city: "Dubai" })).toEqual([]);
    });

    it("still bounds them, and asks for the first line and city", () => {
        expect(
            errorsOf({
                line1: "",
                city: "",
                state: "x".repeat(101),
                postalCode: "x".repeat(17),
                country: "GBR",
            }).map((e) => e.property),
        ).toEqual(["line1", "city", "state", "postalCode", "country"]);
    });
});

describe("a delivery in an India business", () => {
    it("keeps the address as it came, and a sent country is dropped", () => {
        expect(deliveryAddressFor(home({ country: "US" }), INDIA)).toEqual(
            home(),
        );
    });

    it("refuses no state or PIN in the validators' words and shape", () => {
        expect(
            refusal(() =>
                deliveryAddressFor(home({ state: "", postalCode: "" }), INDIA),
            ),
        ).toMatchObject({
            message: ["address.Add the state", "address.Add the PIN code"],
        });
    });

    it("can't be got round by the body saying it is abroad", () => {
        expect(
            refusal(() =>
                deliveryAddressFor(home({ state: "", country: "GB" }), INDIA),
            ),
        ).toMatchObject({ message: ["address.Add the state"] });
    });

    it("keeps its place of supply", () => {
        const { state } = deliveryAddressFor(home(), INDIA);
        const pos = placeOfSupply({
            deliveryState: state,
            businessState: "29",
        });
        expect(pos).toBe("27");
        expect(taxTypeFor(pos, "29")).toBe("INTER");
    });
});

describe("a delivery in a Global business", () => {
    it.each([
        ["GB", "Greater London", "SW1A 1AA", "Greater London, United Kingdom"],
        ["US", "Texas", "78701-1234", "Texas, United States"],
    ])("%s keeps its region and postcode", (country, state, postal, stored) => {
        const out = deliveryAddressFor(
            home({ city: "Town", state, postalCode: postal, country }),
            UK,
        );
        expect(out.state).toBe(stored);
        expect(out.postalCode).toBe(postal);
        expect(out).not.toHaveProperty("country");
    });

    it("takes the UAE with no region and no postcode", () => {
        const out = deliveryAddressFor(
            home({ state: undefined, postalCode: undefined, country: "AE" }),
            UK,
        );
        expect(out.state).toBe("United Arab Emirates");
        expect(out.postalCode).toBeNull();
    });

    it("starts on the business's country when none is sent", () => {
        expect(
            deliveryAddressFor(home({ state: "Kent", postalCode: "" }), UK)
                .state,
        ).toBe("Kent, United Kingdom");
    });

    it("reads an edit sending back what it read, without doubling it", () => {
        expect(
            deliveryAddressFor(home({ state: "Texas, United States" }), UK)
                .state,
        ).toBe("Texas, United States");
    });

    it("refuses an unlisted country and a long postcode or region", () => {
        expect(
            refusal(() => deliveryAddressFor(home({ country: "ZZ" }), UK)),
        ).toMatchObject({ field: "address.country" });
        expect(
            refusal(() =>
                deliveryAddressFor(home({ postalCode: "1234567890123" }), UK),
            ),
        ).toMatchObject({ field: "address.postalCode" });
        expect(
            refusal(() =>
                deliveryAddressFor(home({ state: "x".repeat(61) }), UK),
            ),
        ).toMatchObject({ field: "address.state" });
    });

    it("gets no place of supply out of free text, and no crash", () => {
        const { state } = deliveryAddressFor(
            home({ state: "Goa, or nearby", country: "US" }),
            UK,
        );
        expect(
            placeOfSupply({ deliveryState: state, businessState: null }),
        ).toBeNull();
    });
});

describe("the last delivery offered again", () => {
    const row = {
        deliveryName: null,
        deliveryPhone: "+14155550100",
        deliveryLine1: "1 Main St",
        deliveryLine2: null,
        deliveryCity: "Dubai",
        deliveryState: "United Arab Emirates",
        deliveryPostalCode: null,
    };

    it("comes apart for a Global business, with no postcode", () => {
        expect(savedAddressOf(row, "GLOBAL")).toMatchObject({
            state: "",
            postalCode: "",
            country: "AE",
        });
    });

    it("stays half an address, so not offered, for India", () => {
        expect(savedAddressOf(row)).toBeNull();
    });
});
