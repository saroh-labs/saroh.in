import type { Combo } from "../types";

export const receiptUk: Combo = {
    document: "receipt",
    country: "uk",
    reviewed: false,
    lede: "A UK receipt in pounds that says the money has arrived. GOV.UK treats an invoice and a receipt as two different things, so this one comes after the bill, not in place of it.",
    example: {
        number: "RCT-0301",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Bank transfer" },
        ],
        note: "Payment received in full, thank you. This receipt isn't a VAT invoice.",
    },
    payment: {
        text: "The money has moved, so all this page has to do is prove it. If you're VAT registered, the day it arrives can matter too, as a payment before the work can set the tax point.",
        points: [
            "Bank transfer, with its reference",
            "Card, with the last four digits at most",
            "Cash, written down the same day",
        ],
    },
    fields: [
        {
            name: "The invoice it settles",
            why: "Name the invoice number, so a client's accounts team can close it off.",
        },
        {
            name: "Date received",
            why: "Use the day the money arrived, not the day you wrote this.",
        },
    ],
    tips: [
        {
            title: "Write it as proof of payment only",
            text: "GOV.UK says a receipt acknowledges payment, while an invoice says what's owed and when. Don't treat this page as your VAT record. A VAT-registered client will still want a proper VAT invoice.",
        },
        {
            title: "Be careful with deposits",
            text: "If this records a deposit, Notice 700 says most deposits create a tax point when you receive them. Note on the receipt that it's a deposit, and work out whether VAT is due now.",
        },
        {
            title: "Mark part payments clearly",
            text: "Say what the payment was against and what's left. A receipt that reads part payment, with the balance beside it, stops a client thinking the whole job is settled.",
        },
    ],
    faqs: [
        {
            question: "Do UK businesses have to give receipts?",
            answer: "The GOV.UK invoicing pages we read explain what a receipt is, but don't set a duty to give one. It's quick to send and saves questions.",
        },
        {
            question: "Can a receipt replace a VAT invoice?",
            answer: "GOV.UK says you must use VAT invoices if you and your customer are both registered. If your client is registered, a receipt alone won't do that job. Send the VAT invoice, then a receipt for the payment.",
        },
        {
            question: "How do I record a card payment on a British receipt?",
            answer: "Note that it was by card and, if you want, the last four digits. Leave out the full number and security code. A receipt often gets forwarded around an accounts team, and it doesn't need more than that.",
        },
    ],
};
