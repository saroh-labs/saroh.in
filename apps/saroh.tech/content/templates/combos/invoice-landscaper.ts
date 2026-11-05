import type { Combo } from "../types";

export const invoiceLandscaper: Combo = {
    document: "invoice",
    trade: "landscaper",
    reviewed: false,
    lede: "Bill a garden by what went in the ground: square metres of patio and turf, each plant, tonnes of soil and every load taken away.",
    example: {
        number: "INV-0533",
        issued: "2026-06-05",
        due: "2026-06-19",
        terms: "custom",
        depositPaid: "1000",
        depositLabel: "Paid for stone and plants",
    },
    tips: [
        {
            title: "Measure again before you bill",
            text: "The client's sketch and the finished patio often differ. Bill the area you actually laid, and note the figure. They can check it with a tape, and that ends most queries.",
        },
        {
            title: "Separate plants from planting",
            text: "A hedge looks costly on one line. Showing the nursery stock apart from the digging explains the price, and makes it clear what a plant replacement alone would come to.",
        },
        {
            title: "Add the watering rule",
            text: "New turf can die in a dry fortnight, and then the client calls you. Print who waters and for how long, right on the bill they will keep in a drawer.",
        },
    ],
    faqs: [
        {
            question: "How do I bill a job rain held up for a week?",
            answer: "If you quoted a fixed price, the lost days are yours and the bill stays the same. If you work by the day, charge only the days worked, and list those dates so it adds up.",
        },
        {
            question: "How do I bill regular mowing visits?",
            answer: "Send one monthly invoice, with the visit count and dates on one line. Clients on the same round rarely want a bill per mow. Note any extra hedge cut as a separate line, agreed beforehand.",
        },
        {
            question: "Who pays if a new tree dies after planting?",
            answer: "That turns on what you wrote. Many gardens fail through under-watering, so set a period and a condition in your terms. Put the rule on the invoice, then replace it or bill it accordingly.",
        },
        {
            question: "Is a gate or fence repair done during the job extra?",
            answer: "If it wasn't in the agreed price, yes. Give it its own line and mention when the client approved it. A short message on the day saves you defending that sum weeks after the fence went up.",
        },
    ],
};
