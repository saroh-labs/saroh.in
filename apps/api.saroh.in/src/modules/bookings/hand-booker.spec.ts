/**
 * The rules only a booking made by hand has (DEC-170, owner 19 Oct): a
 * name and phone are enough, "Paid now" is money and says how, and a
 * service only customers book is refused to the team. Pure: `@saroh/database`
 * is mocked so nothing here reads.
 */
jest.mock("@saroh/database", () => ({ prisma: {} }));

import { BadRequestException, ConflictException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import {
    assertBookableByTeam,
    assertHandPayment,
    bookerPhoneKey,
    CANT_TAKE_PAYMENT,
    notBookableByTeamMessage,
} from "./hand-booker";
import { bookerEmailOf } from "./reservation";

function as(roleKey: string, actions?: string[]): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "MEMBER",
        roleKey,
        actions: resolveCapabilities(roleKey, actions),
    };
}

describe("bookerPhoneKey", () => {
    it("matches a phone as orders' walk-ins do: digits, no leading 91", () => {
        expect(bookerPhoneKey("+91 98450 00002")).toBe("9845000002");
        expect(bookerPhoneKey("98450-00002")).toBe("9845000002");
    });

    it("refuses a phone too short to keep anyone by, naming bookerPhone", () => {
        expect(() => bookerPhoneKey("12345")).toThrow(BadRequestException);
        try {
            bookerPhoneKey("abc");
        } catch (error) {
            expect((error as BadRequestException).getResponse()).toMatchObject({
                field: "bookerPhone",
            });
        }
    });
});

describe("assertBookableByTeam (Q5)", () => {
    it("lets the team book a service they can, and one saved before the tick", () => {
        expect(() =>
            assertBookableByTeam({ name: "Facial", bookableByTeam: true }),
        ).not.toThrow();
        expect(() => assertBookableByTeam({ name: "Facial" })).not.toThrow();
    });

    it("refuses one only customers book, naming it", () => {
        expect(() =>
            assertBookableByTeam({ name: "Facial", bookableByTeam: false }),
        ).toThrow(ConflictException);
        expect(() =>
            assertBookableByTeam({ name: "Facial", bookableByTeam: false }),
        ).toThrow(notBookableByTeamMessage("Facial"));
        expect(notBookableByTeamMessage("Facial")).toContain("Facial");
    });
});

describe("assertHandPayment (DEC-098)", () => {
    it("lets a Member book to pay at the visit, and refuses them Paid now", () => {
        const member = as("MEMBER");
        expect(() =>
            assertHandPayment(member, { paidWith: "DESK" }),
        ).not.toThrow();
        expect(() => assertHandPayment(member, {})).not.toThrow();
        expect(() => assertHandPayment(member, { paidWith: "PAID" })).toThrow(
            CANT_TAKE_PAYMENT,
        );
        expect(() =>
            assertHandPayment(member, { paidWith: "PAID", paidBy: "UPI" }),
        ).toThrow(CANT_TAKE_PAYMENT);
    });

    it("lets whoever may take payment say Paid now, with or without how", () => {
        for (const ctx of [
            as("OWNER"),
            as("ADMIN"),
            as("cashier", ["booking:write", "invoice:write"]),
        ]) {
            expect(() =>
                assertHandPayment(ctx, { paidWith: "PAID", paidBy: "CARD" }),
            ).not.toThrow();
            expect(() =>
                assertHandPayment(ctx, { paidWith: "PAID" }),
            ).not.toThrow();
        }
    });

    it("says how they paid only with Paid now", () => {
        expect(() =>
            assertHandPayment(as("OWNER"), {
                paidWith: "DESK",
                paidBy: "CASH",
            }),
        ).toThrow(BadRequestException);
        expect(() =>
            assertHandPayment(as("OWNER"), { paidBy: "CASH" }),
        ).toThrow(BadRequestException);
    });
});

describe("bookerEmailOf", () => {
    it("keeps a real email, lowercased", () => {
        expect(bookerEmailOf(" Asha@Example.com ")).toBe("asha@example.com");
    });

    it("keeps no email for none, or for a phone-only placeholder", () => {
        expect(bookerEmailOf(undefined)).toBeNull();
        expect(bookerEmailOf("")).toBeNull();
        expect(bookerEmailOf("phone+abc@phone.invalid")).toBeNull();
    });
});
