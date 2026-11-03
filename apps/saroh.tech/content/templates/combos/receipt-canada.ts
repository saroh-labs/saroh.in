import type { Combo } from "../types";

export const receiptCanada: Combo = {
    document: "receipt",
    country: "canada",
    reviewed: false,
    lede: "A Canadian receipt in dollars with your registration number and the tax shown, so a business customer has what they need to claim input tax credits.",
    example: {
        number: "RCT-0303",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "E-transfer" },
        ],
        note: "Paid in full, thank you. HST is included in the total shown.",
    },
    payment: {
        text: "A receipt comes after the money, so it records rather than asks. If you never issued an invoice, the CRA's chart lets the payment date stand in for the invoice date.",
        points: [
            "E-transfer, with its reference",
            "Card, with the last four digits at most",
            "Cash, noted the same day",
        ],
    },
    fields: [
        {
            name: "Payment date",
            why: "The CRA's chart accepts it in place of an invoice date when no invoice exists.",
        },
        {
            name: "Tax, or a statement it's included",
            why: "From $100 a business customer needs one or the other to claim back the tax.",
        },
    ],
    tips: [
        {
            title: "Add your number from $100",
            text: "Below $100 the chart only asks for your name, the date and the total. At $100 and up it wants your GST/HST number too. Printing it every time means you never have to check.",
        },
        {
            title: "Add the buyer and terms on large receipts",
            text: "A receipt standing in for an invoice at $500 or more needs the buyer's name, a short description and the terms of payment. A plain card slip won't get a client through that.",
        },
        {
            title: "Mark mixed sales clearly",
            text: "When one receipt has taxable and exempt items on it, the chart asks for the status of each from $100. Mark which lines were taxed so a client can see what the tax applies to.",
        },
    ],
    faqs: [
        {
            question:
                "Can a Canadian receipt replace an invoice for input tax credits?",
            answer: "The CRA's chart talks about receipts, invoices or other documents together, so yes, if it holds the right details for the amount. Missing fields are the risk, since the buyer is the one who must support the claim.",
        },
        {
            question: "How long do I keep Canadian receipts?",
            answer: "RC4022 says you usually keep sales and purchase records for six years from the end of the year they relate to. The CRA can ask for longer, and destroying them early needs its written approval.",
        },
        {
            question: "Can I check a supplier's GST/HST number on a receipt?",
            answer: "If you received one and it looks wrong, ask the supplier first. The CRA also offers a registry to confirm a number. Your own customers may run the same check on you, so print yours correctly.",
        },
    ],
    band: {
        title: "A receipt a client can claim from.",
        line: "Saroh records each payment against the client, so a Canadian receipt with your number on it is ready the moment the money lands.",
    },
};
