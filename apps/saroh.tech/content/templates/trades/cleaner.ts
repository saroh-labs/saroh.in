import type { TradeData } from "../types";

export const cleaner: TradeData = {
    reviewed: false,
    lede: "Made for cleaning work: regular visits, deep cleans, per-room extras, supplies and the keys or access notes your clients expect you to keep straight.",
    items: [
        {
            line: "Regular clean",
            billedBy: "Per visit",
            description: "Weekly clean, 3-bed house",
            qty: "4",
            rate: "60",
        },
        {
            line: "Deep clean",
            billedBy: "Per job or per room",
            description: "Deep clean, whole house",
            qty: "1",
            rate: "200",
        },
        {
            line: "Oven",
            billedBy: "A flat fee per oven",
            description: "Oven clean",
            qty: "1",
            rate: "50",
        },
        {
            line: "Windows",
            billedBy: "Per window or per set",
            description: "Inside windows, per window",
            qty: "10",
            rate: "4",
        },
        {
            line: "Supplies",
            billedBy: "A flat fee, or included",
            description: "Cleaning supplies, per month",
            qty: "1",
            rate: "15",
        },
        {
            line: "Extra hours",
            billedBy: "Per hour",
            description: "Extra hours, after-party tidy",
            qty: "2",
            rate: "20",
        },
    ],
    payment: {
        text: "Regular clients tend to pay after each visit or once a month, while one-off deep cleans are often paid on the day. Whichever you use, state it once and keep every bill the same.",
        points: [
            "Monthly bill for regular visits",
            "Pay on the day for a one-off deep clean",
            "A late-cancel fee when you're turned away at the door",
        ],
    },
    fields: [
        {
            name: "Property address",
            why: "A client with more than one home or rental needs to see which place this bill is for.",
        },
        {
            name: "Visit dates",
            why: "List the dates covered, so a missed week can be spotted right away.",
        },
        {
            name: "Rooms or areas",
            why: "Name them for a deep clean, so it's plain what the price included.",
        },
    ],
    example: {
        from: {
            name: "Your Cleaning Co",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name", address: "18 Elm Close" },
        facts: [{ label: "Visits", value: "3, 10, 17, 24 Mar" }],
        note: "Please give 24 hours' notice to change a visit.",
    },
};
