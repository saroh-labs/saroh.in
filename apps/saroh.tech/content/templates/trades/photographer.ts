import type { TradeData } from "../types";

export const photographer: TradeData = {
    reviewed: false,
    lede: "Built for shoots: hours of coverage, edited images, extras, travel and the booking deposit you already took. Pick the document you need.",
    items: [
        {
            line: "Coverage",
            billedBy: "Hours, half day or full day",
            description: "Wedding coverage, 8 hours",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Second shooter",
            billedBy: "Hours",
            description: "Second shooter, 6 hours",
            qty: "1",
            rate: "400",
        },
        {
            line: "Edited images",
            billedBy: "Number included, then per image",
            description: "Edited images (300 included)",
            qty: "1",
            rate: "0",
        },
        {
            line: "Extra edited images",
            billedBy: "Per image",
            description: "Extra edited images",
            qty: "40",
            rate: "5",
        },
        {
            line: "Prints and albums",
            billedBy: "Per item",
            description: "Printed album, 30 pages",
            qty: "1",
            rate: "350",
        },
        {
            line: "Travel",
            billedBy: "Miles or km, or a flat fee",
            description: "Travel, miles",
            qty: "60",
            rate: "0.50",
        },
    ],
    payment: {
        text: "Most shoots are booked with a deposit to hold the date, and the rest is due before or soon after delivery. Put both on the invoice so the client sees what's left.",
        points: [
            "Deposit to book the date",
            "Balance due on or after the shoot",
            "Extras billed when the gallery is delivered",
        ],
    },
    fields: [
        {
            name: "Shoot date",
            why: "The date ties the bill to the job, and clients look for it when they check the amount.",
        },
        {
            name: "Booking reference",
            why: "A short code links the quote, the deposit and this invoice together.",
        },
        {
            name: "Image rights",
            why: "One line on what the client may do with the photos saves questions later.",
        },
    ],
    example: {
        from: {
            name: "Your Studio Name",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Shoot date", value: "14 Mar" },
            { label: "Booking ref", value: "WED-0314" },
        ],
        note: "Image rights: client may print and share for personal use.",
    },
};
