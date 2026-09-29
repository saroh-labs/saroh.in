import { BadRequestException } from "@nestjs/common";

import { reservedPhoneEmail } from "../contacts/contact-email";
import { isRemovedStoreCustomer } from "../customers/anonymise-customer";
import { orderPartyName } from "./walk-in";
import { walkInPhoneKey } from "./walk-in-customer";

/**
 * B13b's pure rules: the phone a walk-in is kept by, read as E4's picker and
 * C2's duplicates read it, and how a customer known only by it reads. The
 * writes are in `new-order.db.spec.ts`.
 */
describe("walkInPhoneKey", () => {
    it.each([
        ["+91 98450 00002"],
        ["+919845000002"],
        ["9845000002"],
        ["98450 00002"],
        ["+91-98450-000-02"],
        ["(+91) 98450 00002"],
    ])("reads %s as the same number", (typed) => {
        expect(walkInPhoneKey(typed)).toBe("9845000002");
    });

    it("keeps a number that isn't twelve digits as typed, digits only", () => {
        expect(walkInPhoneKey("+44 20 7946 0958")).toBe("442079460958");
        expect(walkInPhoneKey("080 2222 3333")).toBe("08022223333");
    });

    it("refuses one too short to keep them by", () => {
        expect(() => walkInPhoneKey("12345")).toThrow(BadRequestException);
        expect(() => walkInPhoneKey("12 34 56")).toThrow(
            "That doesn't look like a phone number.",
        );
    });
});

describe("a customer known only by their phone", () => {
    const customer = {
        firstName: "Asha",
        lastName: null,
        email: reservedPhoneEmail(),
    };

    it("is nobody removed", () => {
        expect(isRemovedStoreCustomer(customer)).toBe(false);
        expect(
            isRemovedStoreCustomer({ email: "removed+c1@removed.invalid" }),
        ).toBe(true);
    });

    it("is named by their name, never the placeholder", () => {
        expect(orderPartyName({ customerId: "c1", customer })).toBe("Asha");
        expect(
            orderPartyName({
                customerId: "c1",
                customer: { ...customer, firstName: null },
            }),
        ).toBe("Customer");
    });
});
