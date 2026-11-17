import { nextSteps } from "./next-steps";

const ALL = new Set([
    "create_booking",
    "move_booking",
    "update_orders_status",
    "update_order_status",
    "create_order",
    "draft_blog_post",
    "update_product",
]);

describe("an answer's next steps (AF 3, 6, 8)", () => {
    it("follow what the answer read, at most two, each once", () => {
        expect(
            nextSteps(["find_free_slots", "list_orders"], ALL, false).map(
                (s) => s.label,
            ),
        ).toEqual(["Only after 5 pm", "Book someone in…"]);
        expect(nextSteps(["list_orders", "list_orders"], ALL, false)).toEqual([
            {
                label: "Mark orders ready…",
                text: "Mark these orders as ready for pick-up: ",
            },
        ]);
    });

    it("offer only a draft this person's Ask AI can make", () => {
        expect(
            nextSteps(["find_free_slots"], new Set(), false).map(
                (s) => s.label,
            ),
        ).toEqual(["Only after 5 pm"]);
    });

    it("none after a draft, or after a read with nothing to do next", () => {
        expect(nextSteps(["list_orders"], ALL, true)).toEqual([]);
        expect(nextSteps(["get_business_summary"], ALL, false)).toEqual([]);
    });
});
