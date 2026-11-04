import type { Combo } from "../types";

export const receiptPersonalTrainer: Combo = {
    document: "receipt",
    trade: "personal-trainer",
    reviewed: false,
    lede: "Proof of what was paid for at the gym or online, with the pack size and the sessions left written down, so neither of you keeps a tally in your head.",
    items: [
        {
            line: "Session pack",
            billedBy: "Per pack paid",
            description: "Pack of 10 sessions, paid in full",
            qty: "1",
            rate: "500",
        },
        {
            line: "Drop-in session",
            billedBy: "Per session paid",
            description: "Single session, paid on the day",
            qty: "1",
            rate: "60",
        },
        {
            line: "Monthly coaching",
            billedBy: "Per month paid",
            description: "Online coaching, March",
            qty: "1",
            rate: "100",
        },
        {
            line: "Late cancellation",
            billedBy: "Per session charged",
            description: "Late cancellation, 12 Mar",
            qty: "1",
            rate: "60",
        },
        {
            line: "Resistance bands",
            billedBy: "Per item",
            description: "Resistance band set",
            qty: "1",
            rate: "20",
        },
        {
            line: "Bootcamp place",
            billedBy: "Per place",
            description: "Saturday park bootcamp, place",
            qty: "1",
            rate: "15",
        },
    ],
    payment: {
        text: "A trainer's receipt mostly records money paid ahead of the work. Show what it bought and what's left, then update the count on the next one.",
        points: [
            "Cash or transfer at the gym",
            "Sessions used and sessions left",
            "One receipt for each pack or month paid",
        ],
    },
    fields: [
        {
            name: "Sessions left",
            why: "It's the number a client asks for most, and writing it down ends the counting.",
        },
        {
            name: "Pack expires",
            why: "A printed date is the kindest reminder that unused sessions run out.",
        },
        {
            name: "Paid by",
            why: "Cash handed over at the gym needs a record as much as a bank transfer does.",
        },
    ],
    example: {
        number: "RCT-0001",
        issued: "2026-03-02",
        facts: [
            { label: "Paid on", value: "2 Mar 2026" },
            { label: "Paid by", value: "Cash" },
            { label: "Sessions left", value: "10 of 10" },
        ],
        note: "Thanks for training with me. This pack can be used until 2 Jun 2026.",
    },
    tips: [
        {
            title: "Write the count on every receipt",
            text: "Ten paid, four used, six left. A running number saves you both a dispute in week eleven, and it nudges people to book the ones they still have.",
        },
        {
            title: "Treat cash at the gym like any other payment",
            text: "Money handed over between sets is the easiest to forget by the evening. Send the numbered receipt from your phone before the client leaves the floor.",
        },
        {
            title: "Word it for claims with care",
            text: "Some clients try to claim training back through work perks or a health scheme. Describe the service plainly, with dates and your name, and let them ask their own scheme what it covers.",
        },
    ],
    faqs: [
        {
            question:
                "Can a client use my receipt for a workplace wellness allowance?",
            answer: "They can try, and a clear receipt helps. Their employer sets the rules, so show your business name, the date, what was paid for and the amount. If a scheme wants more, the client can tell you exactly what.",
        },
        {
            question: "A client paid for two people. Who is the receipt for?",
            answer: "Issue it to whoever paid, and name both people in the description. If they will split the cost, it's simplest to write two receipts, each for their own share, and match them to the same pack.",
        },
        {
            question: "Do I need a receipt for each session in a monthly plan?",
            answer: "No. One receipt for each payment is enough, with the month it covers. If the plan includes a set number of sessions, put that number in the description so they know what the month paid for.",
        },
    ],
};
