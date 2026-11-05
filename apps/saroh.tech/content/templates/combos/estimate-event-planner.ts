import type { Combo } from "../types";

export const estimateEventPlanner: Combo = {
    document: "estimate",
    trade: "event-planner",
    reviewed: false,
    lede: "A budget view for an event still taking shape, with venue, food and hire as ranges and your own fee shown as the one firm number.",
    items: [
        {
            line: "Planning fee",
            billedBy: "Flat fee, firm",
            description: "Planning and coordination fee",
            qty: "1",
            rate: "2500",
        },
        {
            line: "Venue allowance",
            billedBy: "Allowance, until chosen",
            description: "Venue hire, allowance",
            qty: "1",
            rate: "3000",
        },
        {
            line: "Catering per head",
            billedBy: "Per guest, likely number",
            description: "Catering, likely 120 guests",
            qty: "120",
            rate: "45",
        },
        {
            line: "Decor and flowers",
            billedBy: "Allowance",
            description: "Decor and flowers, allowance",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Sound and light",
            billedBy: "Per day",
            description: "Sound and lighting, one day",
            qty: "1",
            rate: "900",
        },
        {
            line: "Contingency",
            billedBy: "Percent of supplier costs, shown as an amount",
            description: "Contingency for changes",
            qty: "1",
            rate: "500",
        },
    ],
    example: {
        number: "EST-0001",
        issued: "2026-01-12",
        due: "2026-02-09",
        facts: [
            { label: "Event", value: "Company summer party" },
            { label: "Guests assumed", value: "120" },
        ],
        termsText:
            "Only the planning fee is fixed. Other amounts are allowances until suppliers are chosen, and any change will be agreed with you first.",
    },
    tips: [
        {
            title: "Mark which numbers are firm",
            text: "Your own fee is certain and the venue isn't. Say so on each line, using the word allowance, so a client doesn't treat a rough catering figure as an offer from you.",
        },
        {
            title: "Build in a contingency line",
            text: "Events change. Showing a set amount for it, up front, gives everyone room when the marquee costs more. Without it, the first surprise looks like poor planning on your part.",
        },
        {
            title: "Show the per-guest maths",
            text: "Most of an event budget moves with the guest list. Showing the cost per head lets a client see what cutting twenty guests would save, and do the trimming themselves.",
        },
    ],
    faqs: [
        {
            question: "What if a client has a budget and no idea what it buys?",
            answer: "Work back from their figure. Set aside your fee and a contingency, split the rest by category, and show what that amount gets. It's more useful than a dream list they'd have to cut down later.",
        },
        {
            question:
                "Do I charge for the time spent building an event estimate?",
            answer: "Some planners offer a first rough figure free, then charge for a full budget with supplier prices. If it takes you days to prepare, a small paid planning session is reasonable. Set your rule early, and say what it includes.",
        },
        {
            question:
                "How do I stop the estimate being used to shop my ideas elsewhere?",
            answer: "Show categories and allowances, not named suppliers, until the client has booked you. They get what they need to decide, while the contacts and ideas you've gathered stay yours until the work has started.",
        },
    ],
};
