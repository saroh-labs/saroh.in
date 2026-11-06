import { describe, expect, it } from "vitest";

import { DESK_PAID_BY, paidByLabel } from "@/lib/class-packs/sell-words";
import { payOptions } from "@/lib/orders/new-order";
import { PAID_HOW } from "@/lib/orders/paid-how";
import { instantOpens } from "@/lib/qr/panel";
import { PAID_BY_MISSING } from "@/lib/services/booking-pay";
import { deskChoices, methodWord } from "@/lib/services/desk-pay";

import { methodLabel } from "./method-words";

const WORDS = ["Cash", "UPI", "Card", "Bank transfer", "Other"];

describe("one word for each way paid (UX-078)", () => {
    it("names each stored value, BANK and BANK_TRANSFER alike", () => {
        expect(
            ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"].map(methodLabel),
        ).toEqual(WORDS);
        expect(methodLabel("BANK")).toBe("Bank transfer");
        expect(methodLabel("ONLINE")).toBeNull();
        expect(methodLabel("toString")).toBeNull();
        expect(methodLabel(null)).toBeNull();
    });

    it("is what every picker and label says — never where it's taken", () => {
        const labels = [
            ...PAID_HOW.map((w) => w.label),
            ...DESK_PAID_BY.map((w) => w.label),
            ...payOptions({
                pick: null,
                way: null,
                canLink: true,
            }).map((c) => c.label),
            ...deskChoices({
                take: { cents: 50_000, byLink: true },
                canLink: true,
            }).map((c) => c.label),
        ];
        expect(labels.filter((l) => /counter|machine|desk/i.test(l))).toEqual(
            [],
        );
        expect(PAID_HOW.map((w) => w.label)).toEqual(WORDS);
        expect(methodWord("CARD")).toBe("Card");
        expect(paidByLabel("BANK")).toBe("Bank transfer");
    });
});

describe("India's ways paid by hand", () => {
    it("offer and name UPI, as they always did", () => {
        expect(PAID_BY_MISSING).toBe("Say how they paid: Cash, UPI or Card.");
        expect(instantOpens("pay")).toBe(
            "Opens the pay page for this link. It isn't the UPI QR on the invoice.",
        );
        expect(DESK_PAID_BY.map((m) => m.value)).toContain("UPI");
    });
});
