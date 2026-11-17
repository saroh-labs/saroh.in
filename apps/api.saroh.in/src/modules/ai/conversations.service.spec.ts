import { doneWords } from "./conversations.service";

describe("what a conversation did (AF 9)", () => {
    it("says each kind once, counting records", () => {
        expect(doneWords([{ tool: "create_booking", count: 1 }])).toBe(
            "booked 1",
        );
        expect(
            doneWords([
                { tool: "update_orders_status", count: 3, stage: "ready" },
            ]),
        ).toBe("3 marked ready");
        expect(
            doneWords([
                { tool: "create_order", count: 1 },
                { tool: "create_booking", count: 1 },
                { tool: "create_booking", count: 1 },
            ]),
        ).toBe("order created · booked 2");
        expect(doneWords([{ tool: "set_hours", count: 1 }])).toBe("changed");
        expect(doneWords([])).toBeNull();
    });
});
