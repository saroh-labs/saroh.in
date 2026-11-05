import type { Combo } from "../types";

export const receiptSingapore: Combo = {
    document: "receipt",
    country: "singapore",
    reviewed: false,
    lede: "A Singapore receipt in dollars for customers who aren't GST registered, numbered in series, with your GST number and a line saying the price includes GST.",
    example: {
        number: "RCT-0306",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "PayNow" },
        ],
        note: "Price payable includes GST at 9%. Thank you.",
    },
    payment: {
        text: "The payment is done, so say how it came in. A receipt is what IRAS has in mind for customers who aren't registered, in place of a tax invoice.",
        points: [
            "PayNow, with its reference",
            "Card, with the last four digits at most",
            "Cash, written down the same day",
        ],
    },
    fields: [
        {
            name: "Serial number",
            why: "IRAS asks for receipts to be serially printed, so don't skip or reuse a number.",
        },
        {
            name: "Statement that GST is included",
            why: "A plain line like price payable includes GST is what the list asks for.",
        },
    ],
    tips: [
        {
            title: "Keep a copy of each one",
            text: "IRAS asks you to keep a duplicate of each receipt. Filing them in date order makes one easy to find, and keeps your numbering easy to check.",
        },
        {
            title: "Send registered customers a tax invoice",
            text: "A receipt fits a customer who isn't GST registered. If a registered business pays you for a standard-rated sale, it needs a tax invoice, or a simplified one at $1,000 or less.",
        },
        {
            title: "Round the bill the same way every time",
            text: "You may round total GST to the cent, and round the final bill to the nearest 5 cents if you apply it consistently. Keep the same rule on all receipts, so your totals stay comparable.",
        },
    ],
    faqs: [
        {
            question:
                "Do I have to give a receipt to every Singapore customer?",
            answer: "No. IRAS says you don't need its approval to stop issuing them, but customers must agree, registered customers must still get tax invoices, and you have to keep proper records.",
        },
        {
            question: "What does a Singapore GST receipt need to show?",
            answer: "A serial number, the date, your name and GST registration number, the total with GST, and a statement that the price includes GST. A customer's name isn't on the list for this kind of receipt.",
        },
        {
            question: "How long do I keep receipts in Singapore?",
            answer: "IRAS gives at least 5 years for tax invoices you issue and receive. It asks for duplicates of receipts too, so keep those on the same timetable unless your accountant advises otherwise.",
        },
    ],
};
