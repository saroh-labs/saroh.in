import { describe, expect, it } from "vitest";

import type { HeldPack, SellPack } from "./sell-words";
import {
    DESK_PAID_BY,
    firstPackBlock,
    holdingNow,
    paidByLabel,
    sellFailure,
    sellLabel,
    sellNote,
    sellTerms,
    soldMessage,
} from "./sell-words";

const NOW = Date.UTC(2026, 8, 28, 6, 30);

const intro: SellPack = {
    id: "intro",
    name: "Intro 3",
    credits: 3,
    validityDays: 30,
    price: "900.00",
    currency: "INR",
    kind: "CLASSES",
    firstPackOnly: true,
};
const ten: SellPack = {
    ...intro,
    id: "ten",
    name: "10 classes",
    firstPackOnly: false,
    credits: 10,
    price: "1500.00",
};
const pt: SellPack = {
    ...intro,
    id: "pt",
    name: "PT 5",
    kind: "ONE_TO_ONE",
    credits: 5,
    firstPackOnly: true,
};

const KINDS: Record<string, "CLASSES" | "ONE_TO_ONE"> = {
    intro: "CLASSES",
    ten: "CLASSES",
    pt: "ONE_TO_ONE",
};
const kindOf = (id: string) => KINDS[id];

const held: HeldPack[] = [
    { contactId: "asha", packId: "ten", left: 4, standing: "ACTIVE" },
    { contactId: "asha", packId: "intro", left: 0, standing: "EXPIRED" },
    { contactId: "ravi", packId: "gone", left: 2, standing: "ACTIVE" },
];

describe("paid by", () => {
    it("offers what the desk takes, never Online", () => {
        expect(DESK_PAID_BY.map((m) => m.value)).toEqual([
            "CASH",
            "UPI",
            "CARD",
            "BANK",
            "NONE",
        ]);
    });

    it("names a recorded method, and none for a sale from before E13", () => {
        expect(paidByLabel("UPI")).toBe("UPI");
        expect(paidByLabel("NONE")).toBe("None");
        expect(paidByLabel("ONLINE")).toBe("Online");
        expect(paidByLabel(null)).toBe("—");
        expect(paidByLabel(undefined)).toBe("—");
    });
});

describe("the pack's terms", () => {
    it("says the price, the classes and the use-by date", () => {
        expect(sellTerms(ten, NOW)).toBe(
            "₹1,500 · 10 classes · use by 28 October 2026",
        );
        expect(sellTerms(pt, NOW)).toMatch(/· 5 sessions ·/);
    });
});

describe("first pack only", () => {
    it("refuses someone who has had a pack of its kind, before saving", () => {
        expect(firstPackBlock(intro, "asha", "Asha Rao", held, kindOf)).toBe(
            "Intro 3 is only for a first pack, and Asha Rao has had one before.",
        );
    });

    it("lets someone who has only had the other kind buy it", () => {
        expect(firstPackBlock(pt, "asha", "Asha", held, kindOf)).toBeNull();
    });

    it("never blocks on a pack whose kind it doesn't know — the API decides", () => {
        expect(firstPackBlock(intro, "ravi", "Ravi", held, kindOf)).toBeNull();
    });

    it("never blocks a pack that isn't first-only, or before anyone is chosen", () => {
        expect(firstPackBlock(ten, "asha", "Asha", held, kindOf)).toBeNull();
        expect(firstPackBlock(intro, "", "They", held, kindOf)).toBeNull();
    });

    it("says the API's 409 the same way, and passes other refusals through", () => {
        expect(sellFailure("Only for a first pack", "Intro 3", "Asha")).toBe(
            "Intro 3 is only for a first pack, and Asha has had one before.",
        );
        expect(sellFailure("Class pack not found", "Intro 3", "Asha")).toBe(
            "Class pack not found",
        );
    });
});

describe("what they hold now", () => {
    it("adds up live classes of the same kind", () => {
        expect(holdingNow(held, "asha", "CLASSES", kindOf)).toBe(
            "Has 4 classes left on other packs.",
        );
    });

    it("says nothing when they hold none of that kind", () => {
        expect(holdingNow(held, "asha", "ONE_TO_ONE", kindOf)).toBeNull();
        expect(holdingNow(held, "", "CLASSES", kindOf)).toBeNull();
    });
});

describe("the note and the button", () => {
    it("mentions the invoice only with Payments on", () => {
        expect(sellNote(ten, true)).toMatch(
            /^Books nothing · invoice ₹1,500\./,
        );
        expect(sellNote(ten, false)).toBe(
            "Books nothing. The classes are on their account straight away.",
        );
        expect(sellNote(ten, false)).not.toMatch(/invoice/i);
    });

    it("takes the price when the desk took money, else sells", () => {
        expect(sellLabel(ten, "UPI", false)).toBe("Take ₹1,500");
        expect(sellLabel(ten, "NONE", false)).toBe("Sell");
        expect(sellLabel(ten, "NONE", true)).toBe("Sell and invoice");
        expect(sellLabel(ten, "", false)).toBe("Sell");
        expect(sellLabel(undefined, "CASH", false)).toBe("Sell");
    });

    it("confirms by first name, with the use-by date", () => {
        expect(soldMessage("Asha Rao", ten, NOW, false)).toBe(
            "Asha has 10 more classes, to use by 28 October 2026.",
        );
        expect(soldMessage("Asha Rao", ten, NOW, true)).toMatch(
            /The invoice is issued\.$/,
        );
    });
});
