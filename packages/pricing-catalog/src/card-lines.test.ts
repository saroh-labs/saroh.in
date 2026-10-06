import { describe, expect, it } from "vitest";

import { cardLines } from "./card-lines";
import { edit, fixture } from "./catalog.fixture";

describe("cardLines", () => {
    it("lists everything on the first plan, with no lead", () => {
        const r = cardLines(fixture(), "a");
        expect(r.lead).toBe("");
        expect(r.lines.map((l) => l.t)).toEqual([
            "A site",
            "11 things",
            "11 orders a month",
            "1 person",
        ]);
    });

    it("lists only what differs from the plan before", () => {
        const r = cardLines(fixture(), "b");
        expect(r.lead).toBe("Everything in Plan A, plus:");
        expect(r.lines.map((l) => l.t)).toEqual([
            "A site at your address",
            "111 things",
            "Orders",
            "Invoices",
            "3 people",
        ]);
    });

    it("marks a coming-soon row and leaves hidden rows out", () => {
        const r = cardLines(fixture(), "c");
        expect(r.lines).toContainEqual({
            t: "Roles (coming soon)",
            soon: true,
        });
        const hidden = edit(fixture(), (c) => {
            c.modules[4].pricing = "hidden";
        });
        expect(cardLines(hidden, "c").lines.map((l) => l.t)).not.toContain(
            "Roles",
        );
    });

    it("skips retired plans when finding the plan before", () => {
        const c = edit(fixture(), (x) => {
            x.plans[1].retired = true;
        });
        expect(cardLines(c, "c").lead).toBe("Everything in Plan A, plus:");
    });
});
