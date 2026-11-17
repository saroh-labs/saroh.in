import type { AskAiNext } from "@saroh/api-contract";

/**
 * The next steps under an answer (AF 3, 6, 8: "every answer ends in an
 * action"), chosen from what the answer read, never by the model. Each is
 * a draft Ask AI can make, worded for the box: it goes in the box for the
 * person to finish and send, so nothing runs and no question is used
 * until they do. At most two; none once the turn already drafted.
 */
const AFTER: Readonly<Record<string, readonly AskAiNext[]>> = {
    find_free_slots: [
        { label: "Only after 5 pm", text: "Only after 5 pm" },
        { label: "Book someone in…", text: "Book a customer in for " },
    ],
    list_orders: [
        {
            label: "Mark orders ready…",
            text: "Mark these orders as ready for pick-up: ",
        },
    ],
    get_order: [{ label: "Move it on…", text: "Mark this order as " }],
    list_bookings: [
        { label: "Move a booking…", text: "Move the booking for " },
    ],
    get_booking: [{ label: "Move it…", text: "Move this booking to " }],
    get_customer: [
        {
            label: "Order their usual…",
            text: "Make an order for them: their usual, ",
        },
        { label: "Book them in…", text: "Book them in for " },
    ],
    find_lapsed_customers: [
        { label: "Book one of them in…", text: "Book a customer in for " },
    ],
    get_whats_selling: [
        {
            label: "Write a blog post about it…",
            text: "Write a blog post about our best seller: ",
        },
    ],
    summarise_orders: [
        {
            label: "Write a blog post about it…",
            text: "Write a blog post about how this month went: ",
        },
    ],
    list_products: [{ label: "Change a price…", text: "Change the price of " }],
    get_product: [{ label: "Change it…", text: "Change this product's " }],
};

export function nextSteps(
    tools: readonly string[],
    /** The tools this person may draft with in this turn. */
    drafts: ReadonlySet<string>,
    drafted: boolean,
): AskAiNext[] {
    if (drafted) return [];
    const needs: Readonly<Record<string, string>> = {
        "Book someone in…": "create_booking",
        "Book one of them in…": "create_booking",
        "Book them in…": "create_booking",
        "Mark orders ready…": "update_orders_status",
        "Move it on…": "update_order_status",
        "Move a booking…": "move_booking",
        "Move it…": "move_booking",
        "Order their usual…": "create_order",
        "Write a blog post about it…": "draft_blog_post",
        "Change a price…": "update_product",
        "Change it…": "update_product",
    };
    const seen = new Set<string>();
    const out: AskAiNext[] = [];
    for (const tool of tools) {
        for (const step of AFTER[tool] ?? []) {
            const tool = needs[step.label];
            if (seen.has(step.label) || (tool && !drafts.has(tool))) continue;
            seen.add(step.label);
            out.push(step);
        }
    }
    return out.slice(0, 2);
}
