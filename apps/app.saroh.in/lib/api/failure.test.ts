import { describe, expect, it } from "vitest";

import { toFailure } from "./failure";

describe("toFailure", () => {
    it("carries the field from the API envelope's details", () => {
        expect(
            toFailure(
                {
                    error: {
                        code: "CONFLICT",
                        message: "MARKETDAY is already a code in this business",
                        details: { field: "code" },
                    },
                },
                "Could not save",
            ),
        ).toEqual({
            ok: false,
            error: "MARKETDAY is already a code in this business",
            field: "code",
        });
    });

    it("says which business details are missing (DEC-068)", () => {
        expect(
            toFailure(
                {
                    error: {
                        code: "CONFLICT",
                        message:
                            "Add your registered address first. Every invoice prints it.",
                        details: {
                            reason: "BUSINESS_DETAILS_MISSING",
                            missing: ["address"],
                        },
                    },
                },
                "Could not issue",
            ),
        ).toEqual({
            ok: false,
            error: "Add your registered address first. Every invoice prints it.",
            missing: ["address"],
        });
    });

    it("keeps the message and sets no field when there are no details", () => {
        expect(
            toFailure({ error: { message: "Discount not found" } }, "x"),
        ).toEqual({ ok: false, error: "Discount not found" });
    });

    it("falls back to a readable sentence for an unreadable body", () => {
        expect(toFailure(null, "Could not save that code.")).toEqual({
            ok: false,
            error: "Could not save that code.",
        });
        expect(toFailure({ error: { details: ["x"] } }, "Nope.")).toEqual({
            ok: false,
            error: "Nope.",
        });
    });

    it("carries a plan refusal, so the screen shows its notice (U14)", () => {
        const f = toFailure(
            {
                error: {
                    code: "FORBIDDEN",
                    message: "You've reached your 10 products on Plan A",
                    details: {
                        code: "PLAN_LIMIT_REACHED",
                        limit: 10,
                        used: 10,
                        upgradeTo: null,
                        notice: {
                            title: "You've reached your 10 products on Plan A",
                            body: "You can't add more products. Add more with an add-on.",
                            cta: "Add more",
                        },
                    },
                },
            },
            "Could not save",
        );
        expect(f.error).toBe("You've reached your 10 products on Plan A");
        expect(f.plan).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            cta: "Add more",
        });
    });
});
