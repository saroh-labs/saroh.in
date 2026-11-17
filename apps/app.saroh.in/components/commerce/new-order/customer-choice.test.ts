import { describe, expect, it } from "vitest";

import type { CustomerPick } from "@/lib/customers/picker";

import { chosenChip, PICKED, WALK_IN } from "./customer-choice";

const contact = { kind: "contact", id: "c1" } as CustomerPick;

describe("chosenChip", () => {
    it("is nothing before anyone is picked", () => {
        expect(chosenChip(null, ["c1"], false)).toBeNull();
    });
    it("is the listed person's own chip", () => {
        expect(chosenChip(contact, ["c1", "c2"], false)).toBe("c1");
    });
    it("keeps someone the search moved past on their own chip", () => {
        expect(chosenChip(contact, ["c2"], false)).toBe(PICKED);
    });
    it("is Walk-in while its form is open", () => {
        expect(chosenChip(contact, ["c1"], true)).toBe(WALK_IN);
    });
});
