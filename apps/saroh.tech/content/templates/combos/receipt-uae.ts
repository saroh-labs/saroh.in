import type { Combo } from "../types";

export const receiptUae: Combo = {
    document: "receipt",
    country: "uae",
    reviewed: false,
    lede: "A UAE receipt in dirhams that records a payment. If you're registered, remember that a receipt alone isn't a tax invoice, so you may still owe the client one.",
    example: {
        number: "RCT-0305",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Bank transfer" },
        ],
        note: "Payment received, thank you. This receipt isn't a tax invoice.",
    },
    payment: {
        text: "The payment has happened, and for a registered business its date can count. Record the exact day the money arrived, as that date can fix when the supply took place for VAT.",
        points: [
            "Bank transfer, with its reference",
            "Card, with the last four digits at most",
            "Cash, written down the same day",
        ],
    },
    fields: [
        {
            name: "Date received",
            why: "Receipt of payment is one of the events that can set the date of supply.",
        },
        {
            name: "The invoice it settles",
            why: "Name the tax invoice number, so the two records can be matched.",
        },
    ],
    tips: [
        {
            title: "Send the tax invoice as well",
            text: "A registrant making a taxable supply must issue a tax invoice and deliver it to the recipient. A receipt says the money came in, and it doesn't do that second job on its own.",
        },
        {
            title: "Consider a simplified tax invoice instead",
            text: "A customer who isn't a registrant can be given a simplified tax invoice, with fewer details. Busy counters may find that easier than sending two separate documents for a single sale.",
        },
        {
            title: "Round VAT to the nearest fils",
            text: "The FTA's guide says a VAT amount that's a fraction of a fils must be rounded to the nearest fils on a tax invoice. Keep your receipt figures matching, so totals agree to the fils.",
        },
    ],
    faqs: [
        {
            question: "Is a receipt enough for VAT in the UAE?",
            answer: "The Decree-Law asks a registrant making a taxable supply to issue a tax invoice. The articles we read don't name a receipt as a replacement. If you're registered, send the tax invoice too, or use one as your receipt.",
        },
        {
            question: "Can a business not registered for VAT give a receipt?",
            answer: "Yes, it's simply your record of a payment. Don't call it a tax invoice and don't show a VAT line, since any amount collected as tax has to be paid to the Authority even when it wasn't due.",
        },
        {
            question: "Does a payment in advance change my UAE VAT date?",
            answer: "It can. Article 25 sets the date of supply as the earliest of several events, including receipt of payment. So a receipt for an advance is a useful reminder to check your 14-day limit.",
        },
    ],
};
