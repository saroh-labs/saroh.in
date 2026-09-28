import { ConflictException } from "@nestjs/common";

import {
    assertPackOnSale,
    PACK_NOT_PUBLISHED,
    PACKS_ON_SALE,
} from "./pack-on-sale";

function refusal(status: string): {
    message: string;
    details?: Record<string, unknown>;
} {
    try {
        assertPackOnSale({ status });
    } catch (e) {
        expect(e).toBeInstanceOf(ConflictException);
        const body = (e as ConflictException).getResponse();
        return typeof body === "string"
            ? { message: body }
            : (body as { message: string; details?: Record<string, unknown> });
    }
    throw new Error("expected a 409");
}

describe("which packs are on sale (E14)", () => {
    it("sells an ACTIVE pack", () => {
        expect(() => assertPackOnSale({ status: "ACTIVE" })).not.toThrow();
    });

    it("refuses a DRAFT as not published, on the pack", () => {
        expect(refusal("DRAFT")).toEqual({
            message: PACK_NOT_PUBLISHED,
            details: { field: "packId" },
        });
    });

    it("refuses an ARCHIVED pack with today's words", () => {
        expect(refusal("ARCHIVED").message).toMatch(/archived/);
    });

    it("lists only ACTIVE packs for a buyer", () => {
        expect(PACKS_ON_SALE).toEqual({ status: "ACTIVE" });
    });
});
