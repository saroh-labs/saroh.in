import { describe, expect, it } from "vitest";

import type { World, WorldBusiness } from "./world";
import { dayLink, exampleFor, tradeParam } from "./world";

const biz = (key: string, trade: WorldBusiness["trade"]): WorldBusiness => ({
    key,
    trade,
    name: key,
    kind: trade,
    owner: "Owner",
    place: "Somewhere",
    site: `${key}.saroh.app`,
    customers: [],
    items: [],
    tradePage: `/for/${key}`,
});

const world: World = {
    edition: "india",
    today: "Monday 16 Nov 2026",
    date: "2026-11-16",
    money: { provider: "Razorpay", method: "UPI", taxName: "GST" },
    lead: biz("rye", "bakery"),
    others: [biz("neel", "salon"), biz("pulse", "gym")],
};

describe("the example for a trade (?trade=)", () => {
    it("picks the world's business of that trade", () => {
        expect(exampleFor(world, "salon").key).toBe("neel");
        expect(exampleFor(world, "gym").key).toBe("pulse");
        expect(exampleFor(world, "bakery").key).toBe("rye");
    });

    it("falls back to the lead for none, an unknown trade or a trade the world lacks", () => {
        expect(exampleFor(world).key).toBe("rye");
        expect(exampleFor(world, null).key).toBe("rye");
        expect(exampleFor(world, "plumber").key).toBe("rye");
        expect(exampleFor(world, "florist").key).toBe("rye");
    });

    it("reads ?trade= as one known trade or none", () => {
        expect(tradeParam("salon")).toBe("salon");
        expect(tradeParam(["gym", "salon"])).toBe("gym");
        expect(tradeParam("Salon")).toBeNull();
        expect(tradeParam(undefined)).toBeNull();
    });

    it("links an hour to its trade page's anchor", () => {
        expect(dayLink(world.lead, { at: "09:00", line: "" })).toBe(
            "/for/rye#9am",
        );
        expect(
            dayLink(world.lead, { at: "07:00", anchor: "tue7am", line: "" }),
        ).toBe("/for/rye#tue7am");
    });
});
