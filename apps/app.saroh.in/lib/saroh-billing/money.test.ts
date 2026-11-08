/**
 * Saroh's plan money on a Global workspace (stage 9, KTD6c): dollars and no
 * tax, whatever the business sells in; India's words unchanged. Made-up
 * amounts.
 */
import { describe, expect, it, vi } from "vitest";

interface Edition {
    value: "INDIA" | "GLOBAL";
}
const edition = vi.hoisted((): Edition => ({ value: "GLOBAL" }));
vi.mock("@/lib/edition", async () => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        get PROFILE() {
            return editionProfile(edition.value);
        },
    };
});

import { inclTax, planMoney, plusTax, taxSum } from "./money";

describe("plan money by edition", () => {
    it("says dollars with no tax on Global", () => {
        edition.value = "GLOBAL";
        expect(planMoney(1_900)).toBe("$19");
        expect(`${planMoney(1_900)}${plusTax()}`).toBe("$19");
        expect(inclTax()).toBe("");
        expect(taxSum(1_900, 0, 1_900)).toBe("$19");
    });

    it("keeps rupees and GST in India", () => {
        edition.value = "INDIA";
        expect(plusTax()).toBe(" + GST");
        expect(inclTax()).toBe(" (incl. GST)");
        expect(taxSum(10_000, 1_800, 11_800)).toMatch(/ \+ .* GST = /);
    });
});
