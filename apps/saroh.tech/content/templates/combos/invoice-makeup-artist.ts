import type { Combo } from "../types";

export const invoiceMakeupArtist: Combo = {
    document: "invoice",
    trade: "makeup-artist",
    reviewed: false,
    lede: "Bill the bride, the party, the lashes and the early start, with the retainer you already took shown as paid. Fill it online, or download the file.",
    example: {
        number: "INV-0001",
        issued: "2026-03-07",
        due: "2026-03-14",
        depositPaid: "200",
        depositLabel: "Retainer paid",
    },
    tips: [
        {
            title: "Send the balance a week ahead",
            text: "Chasing money with a brush in your hand on the wedding morning is nobody's idea of fun. A bill due before the day lets you arrive and simply get to work.",
        },
        {
            title: "Bill late additions at the agreed rate",
            text: "Somebody's aunt will decide on the morning that she wants her makeup done too. Add her at the per-person rate you already quoted, with her name beside it, and send a short updated bill.",
        },
        {
            title: "Name who pays for the party",
            text: "Bridesmaids may pay for themselves, or the bride may cover them all. Decide before the day. If each person pays you direct, send each a small bill of their own.",
        },
    ],
    faqs: [
        {
            question: "Who do I invoice when the bride's mother is paying?",
            answer: "Bill whoever agreed to pay, and name the bride and the wedding date in the description. A short line, for the wedding of, stops the paying relative wondering what they are looking at.",
        },
        {
            question:
                "What if someone in the party changes her mind on the day?",
            answer: "If she was on your booking, your terms decide it. Your time was held either way, so many artists still bill her. Say so when you confirm the count, and note on the invoice who wasn't made up.",
        },
        {
            question: "How do I bill a photo shoot or a brand job?",
            answer: "Replace the per-person lines with a half or full day rate, and add a line for kit or assistants. A business client may also want your tax number and their own purchase order number shown.",
        },
        {
            question: "Should the trial come off the final bill?",
            answer: "Only if you promised that when they booked. If it counts, show the trial as a full-price line and a matching deduction, so your records still show the work. If it doesn't, keep it as a plain line.",
        },
    ],
};
