import { serializeOrderDetail } from "./serialize";

const base = {
    id: "ord_1",
    orderId: "ORD-001",
    customerId: "cus_1",
    status: "PENDING",
    paymentStatus: "UNPAID",
    total: "10.00",
    currency: "INR",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    customer: null,
    subtotal: "10.00",
    tax: "0.00",
    shipping: "0.00",
    discount: "0.00",
    items: [],
    discountRedemption: null,
};

describe("serializeOrderDetail", () => {
    it("says when the order last changed, for the order screen's timeline", () => {
        const updatedAt = new Date("2026-09-02T12:30:00Z");
        expect(serializeOrderDetail({ ...base, updatedAt }).updatedAt).toEqual(
            updatedAt,
        );
    });

    it("says null rather than inventing a time it was not given", () => {
        expect(serializeOrderDetail(base).updatedAt).toBeNull();
    });
});
