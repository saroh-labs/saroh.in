import { exampleFor } from "@saroh/marketing/world";
import { describe, expect, it } from "vitest";

import { WORLD } from "./world";

/** saroh.in's world is WORLD.md's LOCKED (round 5) table, and nothing else. */
describe("the India example world (DEC-221)", () => {
    const rye = WORLD.lead;
    const num = (id: string) => Number(id.split("-")[1]);

    it("leads with Rye & Co. on Hill Road, Bengaluru, on Grow", () => {
        expect(rye.name).toBe("Rye & Co.");
        expect(rye.owner).toBe("Asha");
        expect(rye.place).toBe("Hill Road, Bengaluru");
        expect(rye.site).toBe("rye-and-co.saroh.app");
        expect(rye.plan).toBe("Grow");
        expect(WORLD.today).toBe("Monday 16 Nov 2026");
        expect(JSON.stringify(WORLD)).not.toMatch(/Bandra|Mumbai|Diwali menu/);
    });

    it("numbers orders ORD-1041 to ORD-1090 and bills INV-0310 to INV-0330", () => {
        for (const o of rye.orders ?? []) {
            expect(o.id).toMatch(/^ORD-\d{4}$/);
            expect(num(o.id)).toBeGreaterThanOrEqual(1041);
            expect(num(o.id)).toBeLessThanOrEqual(1090);
            if (o.invoice.startsWith("INV-")) {
                expect(num(o.invoice)).toBeGreaterThanOrEqual(310);
                expect(num(o.invoice)).toBeLessThanOrEqual(330);
            }
        }
    });

    it("keeps the LOCKED Monday: Neha at 9:14 am, Anjali's link at 4:06 pm, Kavya's site order", () => {
        const order = (id: string) => rye.orders?.find((o) => o.id === id);
        expect(order("ORD-1045")).toMatchObject({
            customer: "Neha Gupta",
            total: "₹950",
            invoice: "INV-0319",
            note: "nut allergy",
        });
        expect(order("ORD-1044")?.paid).toContain("4:06 pm");
        expect(order("ORD-1048")?.placed).toContain("10:14 am");
    });

    it("has every day anchor the pages link to", () => {
        const anchors = (rye.day ?? []).map((h) => h.anchor ?? h.at);
        expect(anchors).toEqual([
            "07:00",
            "09:00",
            "10:00",
            "13:00",
            "16:00",
            "18:00",
            "21:00",
            "tue7am",
        ]);
    });

    it("never reuses a customer's name in another business", () => {
        const names = [WORLD.lead, ...WORLD.others].flatMap((b) =>
            b.customers.map((c) => c.name),
        );
        expect(new Set(names).size).toBe(names.length);
    });

    it("follows ?trade= to the salon, the gym and the florist", () => {
        expect(exampleFor(WORLD, "salon").name).toBe("Studio Neel");
        expect(exampleFor(WORLD, "gym").name).toBe("Pulse Fitness");
        expect(exampleFor(WORLD, "florist").name).toBe("Petal Lane");
        expect(exampleFor(WORLD, "nope").name).toBe("Rye & Co.");
    });
});
