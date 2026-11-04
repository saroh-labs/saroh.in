import type { Combo } from "../types";

export const proformaInvoicePersonalTrainer: Combo = {
    document: "proforma-invoice",
    trade: "personal-trainer",
    reviewed: false,
    lede: "For the employer, school or sports club that must see the cost of your coaching before anyone can sign off the spend. No payment is booked until the real invoice follows.",
    items: [
        {
            line: "Staff wellness day",
            billedBy: "Per day",
            description: "On-site wellness day",
            qty: "1",
            rate: "600",
        },
        {
            line: "Lunchtime class",
            billedBy: "Per class",
            description: "Lunchtime class, 6 weeks",
            qty: "6",
            rate: "100",
        },
        {
            line: "One-to-one staff session",
            billedBy: "Per session",
            description: "One-to-one staff session",
            qty: "10",
            rate: "60",
        },
        {
            line: "Team fitness testing",
            billedBy: "Per player",
            description: "Squad fitness tests, players",
            qty: "20",
            rate: "10",
        },
        {
            line: "Equipment brought in",
            billedBy: "Flat fee per booking",
            description: "Mats and weights, brought to site",
            qty: "1",
            rate: "50",
        },
        {
            line: "Travel to site",
            billedBy: "Per trip",
            description: "Travel to site, trips",
            qty: "7",
            rate: "20",
        },
    ],
    fields: [
        {
            name: "Purchase order or budget code",
            why: "A company buyer often can't raise payment without one, so leave a line for it.",
        },
        {
            name: "Proposed dates",
            why: "Facilities and diaries get booked against this document, so name the weeks.",
        },
        {
            name: "The word Proforma",
            why: "It tells the buyer's finance team that this isn't yet a bill they should record.",
        },
    ],
    example: {
        number: "PRO-0001",
        issued: "2026-01-12",
        due: "2026-02-02",
        client: { name: "Company name", email: "people-team@example.com" },
        facts: [
            { label: "Proposed start", value: "2 Mar" },
            { label: "Staff", value: "Up to 30" },
        ],
        note: "This proforma is for budget approval. A final invoice follows when the dates are confirmed.",
    },
    tips: [
        {
            title: "Write it for the person approving it",
            text: "They may never meet you. Spell out what staff get, how many people, and on which days. A line saying fitness package tells a budget holder nothing they can sign.",
        },
        {
            title: "Split the work from the kit",
            text: "Some budgets pay for wellbeing services but not for equipment, or the other way around. Clean separate lines let a buyer move each cost to the right pot.",
        },
        {
            title: "Say how many people the price covers",
            text: "A class for twenty is a very different hour from a class for sixty. Put your head-count limit beside the line, and the price for added people below it.",
        },
    ],
    faqs: [
        {
            question:
                "Why would an employer ask me for a proforma and not a quote?",
            answer: "Their rules may require a document shaped like an invoice before spending can be approved. It lists the same work, but it signals that the deal is nearly done. Ask what their finance team needs on it, and add that.",
        },
        {
            question:
                "A sports club wants to pay from a grant. Does this help?",
            answer: "Often, since a grant body may ask for a cost in writing before money is released. Show the dates, the players and the work. Ask the club what wording the funder wants, and don't guess at it.",
        },
        {
            question: "Should I hold the class times once I've sent this?",
            answer: "Only if you can afford to. A proforma commits nobody, so say how long you'll hold the slots, and when they go back in your diary. The pay by date is a good place to set that limit.",
        },
    ],
};
