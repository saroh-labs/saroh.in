/** India's console never flags its own words (stage 9, owner 8 Nov 2026). */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edition", async () => {
    const { editionProfile } = await import("@saroh/edition");
    return { PROFILE: editionProfile("INDIA") };
});

import { indiaOnlyNote } from "./plan-money";

describe("indiaOnlyNote on India's console", () => {
    it("says nothing about GST or UPI", () => {
        expect(indiaOnlyNote("GST invoices, UPI payments")).toBeNull();
    });
});
