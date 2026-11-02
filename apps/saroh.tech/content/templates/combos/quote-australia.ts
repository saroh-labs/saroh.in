import type { Combo } from "../types";

export const quoteAustralia: Combo = {
    document: "quote",
    country: "australia",
    reviewed: false,
    lede: "An Australian quote in dollars with a set price that includes GST, your ABN and a date it holds until. Clients can say yes on the page.",
    example: {
        number: "Q-0304",
        termsText:
            "Price covers the work listed and includes GST. Changes are agreed in writing first. Balance is due on launch.",
    },
    payment: {
        text: "Write the terms here so the invoice can repeat them. Business.gov.au's examples range from all up front or in instalments to on delivery or after 30 days.",
        points: [
            "A deposit to hold the booking",
            "Instalments or the balance on delivery",
            "Bank transfer or a card link",
        ],
    },
    fields: [
        {
            name: "Inclusive or exclusive",
            why: "State plainly if your figure includes GST. It's the first thing a business client will check.",
        },
        {
            name: "Valid until",
            why: "Prices and availability move, so give the date this one stops holding.",
        },
    ],
    tips: [
        {
            title: "Lead with the price a client will really pay",
            text: "Registered businesses are told to include GST in the prices of most things they sell. A business client can work out the GST-free figure themselves, so make the bottom line the full one.",
        },
        {
            title: "Name your payment steps now",
            text: "Business.gov.au recommends putting terms on contracts as well as invoices, including how you handle overdue amounts. A quote that a client signs is the easiest place to get that agreed.",
        },
        {
            title: "Quote from the business, not from you",
            text: "Use your registered business name and ABN, the same ones that will appear on the tax invoice. If the names differ, an accounts team will stop and ask why before paying.",
        },
    ],
    faqs: [
        {
            question: "Does a quote need GST on it in Australia?",
            answer: "If you're registered and the sale is taxable, your price should include it, and the quote should say so. If you aren't registered, say nothing about GST and don't add a line for it.",
        },
        {
            question: "What happens when an Australian client accepts?",
            answer: "Nothing about the tax changes until there's a sale to record. Keep the signed quote with the job, then send a tax invoice with the same lines. A quote isn't one, and shouldn't claim to be.",
        },
        {
            question:
                "Can I change a quote after an Aussie customer has signed?",
            answer: "Treat a change as a new agreement. Write down what's different, get a fresh yes, then bill to that. Consumer and contract rules aren't on the tax pages we read, so ask for advice if it's disputed.",
        },
    ],
    band: {
        title: "A quote Australians can say yes to.",
        line: "Send it from Saroh, see when it's accepted, and turn it into a tax invoice without typing anything twice.",
    },
};
