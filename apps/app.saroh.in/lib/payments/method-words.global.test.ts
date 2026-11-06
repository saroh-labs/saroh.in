import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A Global business's customers don't pay by UPI (owner, 6 Nov). */
describe("a Global deployment's ways paid by hand", () => {
    beforeEach(() => {
        vi.stubEnv("NEXT_PUBLIC_EDITION", "GLOBAL");
        vi.resetModules();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("offers no UPI in any picker", async () => {
        const { deskChoices } = await import("@/lib/services/desk-pay");
        const { payOptions } = await import("@/lib/orders/new-order");
        const { PAID_HOW } = await import("@/lib/orders/paid-how");
        const { RECORD_METHODS, FIRST_METHOD } =
            await import("@/lib/invoices/record-payment");
        const { DESK_PAID_BY } = await import("@/lib/class-packs/sell-words");
        const { PAID_BY } = await import("@/lib/services/booking-pay");

        expect(
            deskChoices({
                take: { cents: 50_000, byLink: true },
                canLink: true,
            }).map((c) => c.key),
        ).toEqual(["CASH", "CARD", "LINK"]);
        expect(
            payOptions({ pick: null, way: null, canLink: true }).map(
                (c) => c.key,
            ),
        ).toEqual(["CASH", "CARD", "LINK", "LATER"]);
        expect(PAID_HOW.map((w) => w.label)).toEqual([
            "Cash",
            "Card",
            "Bank transfer",
            "Other",
        ]);
        expect(RECORD_METHODS.map((m) => m.value)).toEqual([
            "CASH",
            "CARD",
            "BANK_TRANSFER",
            "CHEQUE",
            "OTHER",
        ]);
        expect(FIRST_METHOD).toBe("CASH");
        expect(DESK_PAID_BY.map((m) => m.value)).toEqual([
            "CASH",
            "CARD",
            "BANK",
            "NONE",
        ]);
        expect(PAID_BY.map((p) => p.key)).toEqual(["CASH", "CARD"]);
    });

    it("says the ways without UPI", async () => {
        const { PAID_BY_MISSING, payNote } =
            await import("@/lib/services/booking-pay");
        const { instantOpens } = await import("@/lib/qr/panel");
        expect(PAID_BY_MISSING).toBe("Say how they paid: Cash or Card.");
        expect(payNote("PAID")).toBe("Cash or card, taken already");
        expect(instantOpens("pay")).toBe("Opens the pay page for this link.");
    });

    it("still reads a payment recorded as UPI", async () => {
        const { methodLabel } = await import("./method-words");
        const { paidByHandWords } = await import("@/lib/orders/paid-how");
        const { paidByLabel } = await import("@/lib/class-packs/sell-words");
        expect(methodLabel("UPI")).toBe("UPI");
        expect(paidByHandWords("UPI")).toBe("UPI · recorded by hand");
        expect(paidByLabel("UPI")).toBe("UPI");
    });
});
