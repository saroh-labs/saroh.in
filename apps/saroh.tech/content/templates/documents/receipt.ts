import type { DocumentData } from "../types";

export const receipt: DocumentData = {
    slug: "receipt",
    name: "Receipt",
    chip: "Receipt",
    line: "Confirm a payment you've received.",
    reviewed: false,
    lede: "A receipt shows that money has changed hands. This one lists what was paid for, the date, how it was paid and who paid it, so nobody has to ask twice.",
    items: [
        {
            line: "Block of classes",
            billedBy: "Per block",
            description: "Yoga, 10 classes",
            qty: "1",
            rate: "120",
        },
        {
            line: "Private session",
            billedBy: "Per session",
            description: "Private session, 1 hour",
            qty: "2",
            rate: "60",
        },
        {
            line: "Workshop",
            billedBy: "Per place",
            description: "Saturday breathing workshop",
            qty: "1",
            rate: "35",
        },
        {
            line: "Membership",
            billedBy: "Per month",
            description: "Studio membership, months",
            qty: "3",
            rate: "45",
        },
        {
            line: "Goods sold",
            billedBy: "Per item",
            description: "Cork yoga mat",
            qty: "1",
            rate: "50",
        },
        {
            line: "Hire",
            billedBy: "Per visit",
            description: "Towel hire, visits",
            qty: "4",
            rate: "5",
        },
    ],
    payment: {
        text: "A receipt comes after the money, so there are no terms to set. What matters is showing the amount, the date it arrived and the way it was paid. Keep a copy, because it's your record too.",
        points: [
            "Card, bank transfer, cash or a payment link",
            "One receipt for each payment you receive",
            "A part payment shows what's still owed",
        ],
    },
    fields: [
        {
            name: "Paid on and paid by",
            why: "The date and the method are what a client's accountant looks for first.",
        },
        {
            name: "Receipt number",
            why: "A number of its own lets you find this exact payment again if anyone queries it.",
        },
        {
            name: "The invoice it pays",
            why: "Name the invoice number if there was one, so the two records match up.",
        },
    ],
    example: {
        number: "RCT-0001",
        issued: "2026-06-08",
        due: "",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Stillwater Yoga",
            email: "desk@example.com",
            address: "5 Linden Court",
        },
        client: { name: "Priya Shah", email: "priya@example.com" },
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Card" },
        ],
        note: "Thank you. Keep this receipt for your records.",
    },
    tips: [
        {
            title: "Send it straight away",
            text: "A receipt that lands within minutes of the payment makes you look organised. It also ends the awkward question of whether the money really arrived on your side.",
        },
        {
            title: "Show part payments honestly",
            text: "If a client has paid only part of the bill, write the amount received and what's left to pay. A receipt that looks like full payment causes trouble at the end.",
        },
        {
            title: "Keep cash in the same system",
            text: "Cash is the payment people most often want proof of, and the easiest to forget in your own books. Write a numbered receipt for it just as you would for a card.",
        },
    ],
    faqs: [
        {
            question: "Is a receipt the same as a paid invoice?",
            answer: "Not quite. A paid invoice is the original request with a mark to say it's settled. A receipt is its own record of the money arriving. Either can work for a small job, though many business clients ask for a separate receipt.",
        },
        {
            question: "Do I need to give a receipt for a cash payment?",
            answer: "It's the safest habit, even where nobody asks for one. Cash leaves no bank record, so the receipt is the only proof for both of you. Some places have rules on this, so check locally if you take a lot of cash.",
        },
        {
            question: "Should a receipt show tax?",
            answer: "If you charged tax, yes: show the amount included and the rate, so your client can claim it where they're allowed to. If you aren't registered for tax, leave the line off rather than showing a zero.",
        },
        {
            question: "How long should I keep copies of receipts?",
            answer: "Longer than you'd think. Tax offices commonly expect records to be kept for several years, and the exact period depends on where you are. A folder of PDFs per year is plenty, as long as you can find them again.",
        },
    ],
};
