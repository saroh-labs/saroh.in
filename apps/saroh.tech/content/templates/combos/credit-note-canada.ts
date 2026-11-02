import type { Combo } from "../types";

export const creditNoteCanada: Combo = {
    document: "credit-note",
    country: "canada",
    reviewed: false,
    lede: "A Canadian credit note in dollars that takes money off an invoice and returns the GST or HST on it, with a line saying what the adjustment is for.",
    example: { number: "CN-0303" },
    payment: {
        text: "Say what happens to the money. When you refund or credit the tax too, the CRA expects a note that explains the adjustment. When you don't, it says no note is needed for GST/HST.",
        points: [
            "Comes off the unpaid invoice",
            "Refunded by the way they paid",
            "Held as credit on the next order",
        ],
    },
    fields: [
        {
            name: "The adjustment explained",
            why: "RC4022 asks for a note that explains it. A short phrase like volume discount does the job.",
        },
        {
            name: "The rate as first charged",
            why: "Match the invoice, so the tax you give back equals the tax you collected.",
        },
    ],
    tips: [
        {
            title: "Use it for volume discounts earned later",
            text: "If a client earns a discount after the sale, and you credit the tax on it, RC4022 tells you to issue a credit note explaining the adjustment. It's treated the same way as returned goods.",
        },
        {
            title: "Agree on who writes it",
            text: "RC4022 also lets the customer issue a debit note instead. Decide this with larger clients, so you don't both record the same adjustment and take it off twice.",
        },
        {
            title: "Skip it when no tax changes",
            text: "If you're not adjusting, refunding or crediting the GST/HST, the CRA says you need no note for those purposes. You may still want one for your own books, and to keep the numbering whole.",
        },
    ],
    faqs: [
        {
            question:
                "What's the difference between a credit note and a debit note in Canada?",
            answer: "They record the same change from opposite sides. You issue a credit note, or your customer issues a debit note, and RC4022 treats either as explaining the adjustment. One is enough, so agree which it will be.",
        },
        {
            question:
                "Which reporting period does a Canadian credit note fall in?",
            answer: "The parts of RC4022 we read don't settle this one for every case, so we won't guess. Ask your accountant, or read the guide's returned goods section, before you file for the period involved.",
        },
        {
            question: "Does a customer in Quebec get the same credit note?",
            answer: "The CRA's pages cover GST/HST, while its table shows Quebec's own 9.975% rate on top. If you charged both, your note should give back both. Check Revenu Québec's pages for its side of it.",
        },
    ],
    band: {
        title: "Fix a Canadian bill properly.",
        line: "Issue a credit note in Saroh and it stays attached to the invoice and the client, with the GST or HST worked out for you.",
    },
};
