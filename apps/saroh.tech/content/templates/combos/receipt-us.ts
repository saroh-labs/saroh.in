import type { Combo } from "../types";

export const receiptUs: Combo = {
    document: "receipt",
    country: "us",
    reviewed: false,
    lede: "A US receipt in dollars that records what was paid, when and how. It's the proof your customer keeps, and a record of gross receipts for your own books.",
    example: {
        number: "RCT-0302",
        facts: [
            { label: "Paid on", value: "Jun 8, 2026" },
            { label: "Paid by", value: "Check no. 1042" },
        ],
        note: "Paid in full, with thanks. Please keep this receipt.",
    },
    payment: {
        text: "The money has already moved, so this page only needs to say how. The record of the method helps when a client's bookkeeper matches it against a bank statement.",
        points: [
            "Card, with the last four digits at most",
            "Check, with its number",
            "Cash, written down the same day",
        ],
    },
    fields: [
        {
            name: "Check number",
            why: "It ties the receipt to one deposit, which helps when the bank statement only shows a total.",
        },
        {
            name: "Sales tax collected",
            why: "Show it apart from the price, so you can pull the tax figure when your state return comes due.",
        },
    ],
    tips: [
        {
            title: "Number them like the IRS might ask",
            text: "The IRS lists receipt books among the documents that show your gross receipts. Numbered receipts in order make it easy to show that nothing has been left out.",
        },
        {
            title: "Deposit the money and note the source",
            text: "A receipt says who paid you, and your deposit record says where it went. Keep them matched by date and amount. It will save hours when you add up the year.",
        },
        {
            title: "Never write a full card number",
            text: "A receipt gets forwarded, printed and filed. If you note the card at all, use the last four digits, and leave out the expiry date and the security code.",
        },
    ],
    faqs: [
        {
            question: "Does US law make me give a receipt for every sale?",
            answer: "None of the federal or state tax pages we read says so. Still, it helps your client: the IRS expects their records to show who was paid, how much and when.",
        },
        {
            question: "What should a receipt show so a client can deduct it?",
            answer: "The IRS asks for the payee, the amount, proof of payment, the date, and a description showing it was for a business expense. Write the item plainly: office shoot, 2 hours, instead of services.",
        },
        {
            question: "How do I handle sales tax on an American receipt?",
            answer: "Show the rate and the amount apart from the price where your state expects that. Texas accepts a tax-included price only if you've told the customer in writing and posted a sign. Other states may differ.",
        },
    ],
};
