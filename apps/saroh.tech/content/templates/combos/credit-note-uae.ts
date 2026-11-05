import type { Combo } from "../types";

export const creditNoteUae: Combo = {
    document: "credit-note",
    country: "uae",
    reviewed: false,
    lede: "A UAE tax credit note in dirhams, headed with the words Article 60 asks for, showing the original value, the correct value, the difference and the VAT on it.",
    example: {
        heading: "Tax Credit Note",
        number: "CN-0305",
        facts: [
            { label: "Against tax invoice", value: "INV-0417" },
            { label: "Value on tax invoice", value: "AED 1,000" },
            { label: "Correct value", value: "AED 611" },
            { label: "Difference", value: "AED 389" },
            { label: "Reason", value: "Goods returned, order changed" },
        ],
    },
    payment: {
        text: "Article 70 says a registrant issues a tax credit note when output tax falls on a supply, and delivers it to the recipient. Tell your client what happens to the money too.",
        points: [
            "Comes off what's still owed",
            "Refunded to the account that paid",
            "Held as credit for the next order",
        ],
    },
    fields: [
        {
            name: "Original and correct values",
            why: "Article 60 asks for both, plus the difference and the tax on it in AED.",
        },
        {
            name: "A brief explanation",
            why: "Say what caused the change, like goods returned, in a few plain words.",
        },
        {
            name: "Identifying the supply",
            why: "The original tax invoice number is the plainest way to do this.",
        },
    ],
    tips: [
        {
            title: "Use the exact words at the top",
            text: "Article 60 wants Tax Credit Note clearly displayed. A plain credit note heading won't meet that wording, and this template already has it set for you.",
        },
        {
            title: "Show three values, not one",
            text: "It isn't enough to give the amount coming off. List the value on the tax invoice, the right value and the gap between them, and work out the VAT on that gap in dirhams.",
        },
        {
            title: "Use the buyer's version only by agreement",
            text: "The Regulation has rules for a note created by the buyer, in writing, with the words Tax Credit Note created by buyer. Without that agreement, the note is yours to issue.",
        },
    ],
    faqs: [
        {
            question: "When must a UAE business issue a tax credit note?",
            answer: "The Decree-Law ties it to a reduction of output tax on a supply you made. The Regulation lists what goes on it. Article 60 also lets the Authority relax these on application, where records are sufficient.",
        },
        {
            question: "Can a tax credit note be sent by email in the UAE?",
            answer: "Article 60 allows electronic issue, as long as you can store a secure copy under the record keeping rules. Keep the PDF you send with the tax invoice it corrects.",
        },
        {
            question:
                "Should the credit be shown in dirhams if I billed in dollars?",
            answer: "Article 60 asks for the difference and the tax on it in AED, so yes for those figures. Show the dollar amount as well if your client paid in dollars. It helps them match the note to their bank.",
        },
    ],
};
