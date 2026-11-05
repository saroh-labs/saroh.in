import type { Combo } from "../types";

export const creditNoteAustralia: Combo = {
    document: "credit-note",
    country: "australia",
    reviewed: false,
    lede: "An Australian credit note in dollars that corrects an invoice you've sent and shows the GST going back. Check with the ATO or your tax adviser what it needs on it for GST.",
    example: { number: "CN-0304" },
    payment: {
        text: "Tell your client what happens next. Most will want one of three things, and it's best agreed in writing so the accounts on both sides show the same balance.",
        points: [
            "Taken off the amount they still owe",
            "Refunded to the account they paid from",
            "Kept as credit on the next job",
        ],
    },
    fields: [
        {
            name: "The invoice it changes",
            why: "Give that tax invoice's number and date, so a bookkeeper can match the two straight away.",
        },
        {
            name: "GST going back",
            why: "Show it on its own line. It's one-eleventh of a GST-inclusive credit at the 10% rate.",
        },
    ],
    tips: [
        {
            title: "Check the ATO's rules before you rely on this",
            text: "There may be a specific document or wording the ATO wants for GST, so read its page or ask your tax adviser first.",
        },
        {
            title: "Do the sum backwards from the total",
            text: "If you credit $110 that included GST, $10 of it is the GST. Writing both figures saves a client from having to work out the split themselves.",
        },
        {
            title: "Report it on your activity statement",
            text: "Your activity statement reports total sales and GST on sales. A credit that lowers a sale lowers those figures too, so make sure it's in your books before you lodge.",
        },
    ],
    faqs: [
        {
            question:
                "Is a credit note required in Australia when I give a refund?",
            answer: "Ask the ATO or your tax adviser. Either way, a written note gives you and your client one record of why the amount changed and by how much.",
        },
        {
            question: "How do I credit a sale that had no GST on it?",
            answer: "Leave the GST line off, and use the same layout as the original invoice. If you weren't registered at the time of the sale, a client has no GST to reverse, so the note simply lowers the bill.",
        },
        {
            question:
                "Can an Aussie business just reissue the invoice instead?",
            answer: "Quietly replacing an invoice leaves two versions of one number, and a client may already have filed the first one. A separate note, with its own number, keeps every step visible.",
        },
    ],
};
