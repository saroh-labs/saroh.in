import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    looksPersonal,
    PERSONAL_FIELDS,
    personalFields,
    personalModels,
    unruledPersonalFields,
} from "./personal-data";

/**
 * The schema guard for personal details outside `Contact` (C11): every
 * field that looks personal on a model a person's details reach has a
 * privacy removal rule, or says why it is kept. A new column holding a
 * name, an address or a note can't ship without one.
 */
const schema = readFileSync(
    resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
    "utf8",
);

describe("every personal field has a removal rule", () => {
    it("reaches the models a person's details live in", () => {
        // A sanity floor, so a parser that finds nothing can't pass.
        expect(personalModels(schema)).toEqual(
            expect.arrayContaining([
                "Booking",
                "Contact",
                "Customer",
                "Delivery",
                "Message",
                "Order",
                "ProductReview",
                "ReviewInvitation",
            ]),
        );
    });

    it("finds the fields the plan names", () => {
        expect(personalFields(schema)).toEqual(
            expect.arrayContaining([
                "Booking.bookerName",
                "Customer.email",
                "Message.toAddress",
                "Order.deliveryName",
                "Order.deliveryState",
                "ProductReview.displayName",
                "ReviewInvitation.toAddress",
            ]),
        );
    });

    it("covers the schema as it is", () => {
        expect(unruledPersonalFields(schema)).toEqual([]);
    });

    it("names no field the schema no longer has", () => {
        const present = new Set(personalFields(schema));
        expect(
            Object.keys(PERSONAL_FIELDS).filter((key) => !present.has(key)),
        ).toEqual([]);
    });

    it("keeps what the law and the tax records need, and says why", () => {
        for (const key of [
            "Invoice.billToName",
            "Invoice.billToEmail",
            "Invoice.billToAddress",
            "Order.deliveryState",
        ]) {
            expect(PERSONAL_FIELDS[key]?.rule).toBe("kept");
            expect(PERSONAL_FIELDS[key]?.why.length).toBeGreaterThan(10);
        }
    });

    it("fails when a new personal field is added without a rule", () => {
        const withPhone = schema.replace(
            /^model Order \{/m,
            "model Order {\n  giftRecipientPhone String?",
        );
        expect(unruledPersonalFields(withPhone)).toEqual([
            "Order.giftRecipientPhone",
        ]);
    });

    it("fails when a new model hanging off a customer holds an address", () => {
        const withTable = `${schema}
model GiftCard {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  sendToEmail String
}
`;
        expect(unruledPersonalFields(withTable)).toEqual([
            "GiftCard.sendToEmail",
        ]);
    });
});

describe("looksPersonal", () => {
    it.each([
        "email",
        "phone",
        "firstName",
        "bookerEmail",
        "deliveryLine1",
        "toAddress",
        "displayName",
        "invitedTo",
        "billToAddress",
        "notes",
        "intakeNote",
    ])("flags %s", (field) => {
        expect(looksPersonal(field)).toBe(true);
    });

    it.each(["id", "status", "currency", "orderId", "providerMandateId"])(
        "leaves %s",
        (field) => {
            expect(looksPersonal(field)).toBe(false);
        },
    );
});
