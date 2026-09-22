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
});
