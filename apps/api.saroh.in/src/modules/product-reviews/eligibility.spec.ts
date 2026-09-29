import { INELIGIBLE_MESSAGE, orderIneligibility } from "./eligibility";

const paidAndDelivered = {
    organizationId: "org_1",
    status: "DELIVERED",
    paymentStatus: "PAID",
    customerEmail: "asha@example.in",
};

describe("orderIneligibility", () => {
    it("a paid, delivered order with products can be asked for reviews", () => {
        expect(
            orderIneligibility({ ...paidAndDelivered, productLines: 2 }),
        ).toBeNull();
    });

    it("counts nothing when the lines weren't counted, as before", () => {
        expect(orderIneligibility(paidAndDelivered)).toBeNull();
    });

    it("a treatment's order bills only a service: nothing to review (E9)", () => {
        expect(
            orderIneligibility({ ...paidAndDelivered, productLines: 0 }),
        ).toBe("no-products");
        expect(INELIGIBLE_MESSAGE["no-products"]).toBe(
            "This order has no products to review.",
        );
    });

    it("still says the order's own reason first", () => {
        expect(
            orderIneligibility({
                ...paidAndDelivered,
                paymentStatus: "UNPAID",
                productLines: 0,
            }),
        ).toBe("not-paid");
    });

    it("a walk-in kept by their phone (B13b) has no email to send the link to", () => {
        expect(
            orderIneligibility({
                ...paidAndDelivered,
                customerEmail: "phone+0f3c@phone.invalid",
            }),
        ).toBe("no-email");
    });
});
