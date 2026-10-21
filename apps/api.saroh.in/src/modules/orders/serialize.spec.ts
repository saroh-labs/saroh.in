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

describe("serializeOrderDetail: what a line bills (E9)", () => {
    const line = {
        id: "li_1",
        quantity: 1,
        price: "12000.00",
        variantId: null,
        variant: null,
    };

    it("names a product line from its product", () => {
        const [item] = serializeOrderDetail({
            ...base,
            items: [
                {
                    ...line,
                    productId: "p_1",
                    product: { name: "Sourdough" },
                },
            ],
        }).items;
        expect(item).toMatchObject({
            productId: "p_1",
            serviceId: null,
            kind: "product",
            name: "Sourdough",
        });
    });

    it("names a treatment's line from its service, with no product", () => {
        const [item] = serializeOrderDetail({
            ...base,
            items: [
                {
                    ...line,
                    productId: null,
                    product: null,
                    serviceId: "svc_rct",
                    service: { name: "Root canal treatment" },
                },
            ],
        }).items;
        expect(item).toMatchObject({
            productId: null,
            serviceId: "svc_rct",
            kind: "service",
            name: "Root canal treatment",
            price: "12000.00",
        });
    });
});

describe("serializeOrderDetail: where its visit came from (U15 privacy review)", () => {
    const placed = {
        ...base,
        visitSource: "instagram",
        visitRef: "diwali-post",
    };

    it("shows it to someone who reads Insights", () => {
        expect(
            serializeOrderDetail(placed, { visitSource: true }).cameFrom,
        ).toEqual({ source: "instagram", ref: "diwali-post" });
        expect(
            serializeOrderDetail(base, { visitSource: true }).cameFrom,
        ).toBeNull();
    });

    it("leaves it out for everyone else, and by default", () => {
        expect(
            "cameFrom" in serializeOrderDetail(placed, { visitSource: false }),
        ).toBe(false);
        expect("cameFrom" in serializeOrderDetail(placed)).toBe(false);
    });
});
