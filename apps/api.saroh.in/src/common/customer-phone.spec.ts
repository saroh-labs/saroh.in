import { CUSTOMER_PHONE, isCustomerPhone } from "./customer-phone";

describe("a phone a customer types on a business's site", () => {
    it("takes a number as people write one", () => {
        for (const phone of [
            "9845012345",
            "+91 98450 12345",
            "(080) 4099-2210",
            " 022 4000 0000 ",
        ]) {
            expect(isCustomerPhone(phone)).toBe(true);
        }
    });

    it("refuses nothing, words, too few digits and punctuation alone", () => {
        for (const phone of [
            null,
            undefined,
            "",
            "   ",
            "call me",
            "12345",
            "------",
            "98450x12345",
            "9".repeat(25),
        ]) {
            expect(isCustomerPhone(phone)).toBe(false);
        }
    });

    it("is the booking page's rule too", () => {
        expect(CUSTOMER_PHONE.test("+91 98450 12345")).toBe(true);
        expect(CUSTOMER_PHONE.test("phone")).toBe(false);
    });
});
