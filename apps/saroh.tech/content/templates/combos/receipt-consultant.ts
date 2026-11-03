import type { Combo } from "../types";

export const receiptConsultant: Combo = {
    document: "receipt",
    trade: "consultant",
    reviewed: false,
    lede: "Confirm a payment from a client's finance team, or from a small business owner who paid you directly, with the invoice, purchase order and period all named.",
    items: [
        {
            line: "Retainer",
            billedBy: "Per month",
            description: "Retainer, June",
            qty: "1",
            rate: "1000",
        },
        {
            line: "Coaching sessions",
            billedBy: "Per session",
            description: "Founder coaching sessions",
            qty: "4",
            rate: "150",
        },
        {
            line: "Strategy day",
            billedBy: "Per day",
            description: "Strategy day, 12 May",
            qty: "1",
            rate: "800",
        },
        {
            line: "Training",
            billedBy: "Per session",
            description: "Team training session",
            qty: "1",
            rate: "400",
        },
        {
            line: "Report",
            billedBy: "A fixed fee",
            description: "Market research report",
            qty: "1",
            rate: "500",
        },
        {
            line: "Expenses repaid",
            billedBy: "At cost",
            description: "Expenses, May trip",
            qty: "1",
            rate: "150",
        },
    ],
    payment: {
        text: "Money from a large client tends to land with a remittance note, not a message. Your receipt should echo their invoice and order numbers, so both sides can match the payment.",
        points: [
            "Quote the invoice and PO numbers",
            "One receipt can cover several invoices if you list them",
            "Say if a payment was short, and by how much",
        ],
    },
    fields: [
        {
            name: "Invoices settled",
            why: "Finance teams often pay many bills in one transfer, so list each one this covers.",
        },
        {
            name: "Purchase order number",
            why: "It lets their records match yours without another email.",
        },
        {
            name: "Remittance reference",
            why: "The reference from their payment makes this transfer easy to find in both banks.",
        },
    ],
    example: {
        number: "RCT-0533",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Bank transfer" },
            { label: "PO number", value: "PO-4471" },
        ],
        note: "Settles invoices INV-0530 and INV-0534. Nothing further is due.",
    },
    tips: [
        {
            title: "Match their remittance note",
            text: "When finance pays several of your bills at once, copy their reference and list each bill settled. Then a later audit of their supplier payments finds your record straight away.",
        },
        {
            title: "Flag short payments",
            text: "Some large clients deduct a fee or a local tax before paying. Write what arrived, what's still open, and ask why. Quietly marking it paid in full loses you that money.",
        },
        {
            title: "Keep expense repayments visible",
            text: "Money repaying your train fares isn't the same as your fee, and your bookkeeper may treat it differently. Show it on its own line, so your own income figures stay accurate too.",
        },
    ],
    faqs: [
        {
            question: "Do corporate clients even want receipts?",
            answer: "Many don't, because their bank record and your invoice are enough. Ask once, then follow their preference. Sole traders and small owners paying you by card are more likely to want one for their own tax records.",
        },
        {
            question:
                "A client took a tax off my fee before paying. What do I write?",
            answer: "Show the full fee, the tax they held back and the amount that reached you. Ask them for the certificate or statement of what they withheld. Take advice on how to claim it, since rules differ by country.",
        },
        {
            question:
                "Should a retainer paid in advance have a receipt before the work happens?",
            answer: "It can. Write the month it covers, and make clear it's a payment for time ahead. If the retainer later ends early, that wording makes it much simpler to work out any amount you might need to give back.",
        },
        {
            question:
                "How do I confirm a coaching payment to someone claiming it from their employer?",
            answer: "Put their full name on it, along with the session dates and a plain description, such as leadership coaching. Their employer may ask for those details. Don't add private notes about what you talked about in the sessions.",
        },
    ],
    band: {
        title: "Records finance can match.",
        line: "Saroh sends a numbered receipt when you mark a payment, and keeps it with the client and the invoices it settles.",
    },
};
