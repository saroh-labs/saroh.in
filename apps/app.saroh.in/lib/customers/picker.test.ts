import { describe, expect, it } from "vitest";

import {
    MIN_WALK_IN_PHONE_DIGITS,
    walkInCopy,
    walkInPhone,
} from "@/lib/customers/picker";

/**
 * The walk-in form's words (B13b): a phone keeps them as a customer, and the
 * form says so before it is used. The API decides who they are; this only
 * reads what was typed.
 */
describe("walkInPhone", () => {
    it("is none for nothing typed", () => {
        expect(walkInPhone("")).toBe("none");
        expect(walkInPhone("   ")).toBe("none");
    });

    it("is short below the digits the API keeps a customer by", () => {
        expect(MIN_WALK_IN_PHONE_DIGITS).toBe(7);
        expect(walkInPhone("12345")).toBe("short");
        expect(walkInPhone("+91")).toBe("short");
    });

    it("is a phone however it is written", () => {
        expect(walkInPhone("+91 98450 00002")).toBe("phone");
        expect(walkInPhone("9845000002")).toBe("phone");
        expect(walkInPhone("(080) 2222-3333")).toBe("phone");
    });
});

describe("walkInCopy", () => {
    it("asks for a phone to keep them, and uses them as a walk-in without", () => {
        expect(walkInCopy("")).toEqual({
            hint: "Add a phone to keep them as a customer.",
            action: "Use walk-in",
        });
    });

    it("says they'll be kept as a customer once a phone is typed", () => {
        expect(walkInCopy("+91 98450 00002")).toEqual({
            hint: "They'll be kept as a customer, by this phone.",
            action: "Keep as customer",
        });
    });

    it("doesn't promise it for a phone too short to keep them by", () => {
        expect(walkInCopy("123").action).toBe("Use walk-in");
    });
});
