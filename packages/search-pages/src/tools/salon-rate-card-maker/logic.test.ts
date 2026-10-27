import { describe, expect, it } from "vitest";

import { cardSections, price, STARTERS, ticked } from "./logic";

// The boards' sample: Rye Studio's seven services.
const PRICES = ["850", "1,400", "3,200", "900", "2,200", "600", "800"];
const RYE = STARTERS.map((s, i) => ({ ...s, price: PRICES[i] ?? "" }));

describe("salon rate card", () => {
    it("draws the boards' card, by section, to the rupee", () => {
        expect(cardSections(RYE)).toEqual([
            {
                section: "Hair",
                lines: [
                    {
                        name: "Haircut and blow-dry",
                        time: "45 min",
                        price: "₹850",
                    },
                    { name: "Hair spa", time: "60 min", price: "₹1,400" },
                    { name: "Global colour", time: "120 min", price: "₹3,200" },
                ],
            },
            {
                section: "Skin",
                lines: [
                    { name: "Clean-up", time: "40 min", price: "₹900" },
                    {
                        name: "Hydrating facial",
                        time: "60 min",
                        price: "₹2,200",
                    },
                ],
            },
            {
                section: "Hands and feet",
                lines: [
                    { name: "Manicure", time: "30 min", price: "₹600" },
                    { name: "Pedicure", time: "45 min", price: "₹800" },
                ],
            },
        ]);
        expect(ticked(RYE)).toBe(7);
    });

    it("shows a gap, never ₹0, for a ticked service with no price", () => {
        expect(cardSections(STARTERS)[0]?.lines[0]?.price).toBe("[price]");
        expect(price("abc")).toBeNull();
        expect(price("₹1400")).toBe("₹1,400");
    });

    it("leaves unticked services off", () => {
        const off = RYE.map((s) =>
            s.section === "Skin" ? { ...s, on: false } : s,
        );
        expect(cardSections(off).map((s) => s.section)).toEqual([
            "Hair",
            "Hands and feet",
        ]);
    });
});
