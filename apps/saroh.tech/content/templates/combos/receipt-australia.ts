import type { Combo } from "../types";

export const receiptAustralia: Combo = {
    document: "receipt",
    country: "australia",
    reviewed: false,
    lede: "An Australian receipt in dollars with your business name and ABN, the date, what was sold and the price, as business.gov.au lists them.",
    example: {
        number: "RCT-0304",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Bank transfer" },
        ],
        note: "Paid in full, thank you. The total includes GST.",
    },
    payment: {
        text: "The sale is done, so the page only has to prove it. Say how the money came, and tie it to an invoice if there was one, so your records line up with the bank's.",
        points: [
            "Bank transfer, with its reference",
            "Card, with the last four digits at most",
            "Cash, written down at the time",
        ],
    },
    fields: [
        {
            name: "ABN or ACN",
            why: "Business.gov.au lists one or the other on a receipt.",
        },
        {
            name: "Description of the sale",
            why: "A line like blue kettle, 1 tells a customer far more than the word goods.",
        },
    ],
    tips: [
        {
            title: "Hand it over at the sale above $75",
            text: "Business.gov.au says you must give a receipt at the time of sale for purchases over $75, not counting GST. Don't wait until someone asks, as you can on smaller amounts.",
        },
        {
            title: "Answer small requests within 7 days",
            text: "Under that figure, you must provide one within 7 days of a customer asking. Keep a template handy so a small request doesn't get lost in your inbox.",
        },
        {
            title: "Know when a receipt must do more",
            text: "If you're using a tax invoice as your receipt, it has to carry the extra tax invoice details as well. Check that your layout has them before a business customer asks.",
        },
    ],
    faqs: [
        {
            question: "Must a small Australian shop give a receipt every time?",
            answer: "Offering one at any amount is described as good practice. Business.gov.au separates the legal duty: at the sale above $75 excluding GST, and within 7 days on request below it.",
        },
        {
            question: "Can a tax invoice work as an Australian receipt?",
            answer: "Yes, business.gov.au says you can issue one as your receipt, as long as it includes the additional information a tax invoice needs. That page also lists what an ordinary receipt shows.",
        },
        {
            question: "Does a receipt have to mention GST in Australia?",
            answer: "The receipt list we read doesn't include a GST line, only the price. A customer who needs to claim the GST back will want a tax invoice, so offer one when they ask.",
        },
    ],
};
