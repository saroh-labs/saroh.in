import type { Combo } from "../types";

export const creditNoteUk: Combo = {
    document: "credit-note",
    country: "uk",
    reviewed: false,
    lede: "A UK credit note in pounds with what VAT Notice 700 lists: your VAT number, the original invoice's number and date, the items, and the VAT being credited.",
    example: {
        number: "CN-0301",
        facts: [
            { label: "Against invoice", value: "INV-0417" },
            { label: "Invoice date", value: "3 Aug 2026" },
            { label: "Reason", value: "Goods returned, order changed" },
        ],
    },
    payment: {
        text: "Say what happens to the money. If you're refunding it, Notice 700 says a valid credit note goes out within 14 days of the refund payment.",
        points: [
            "Taken off an unpaid invoice",
            "Refunded to the account that paid",
            "Kept as credit, if you both agree",
        ],
    },
    fields: [
        {
            name: "Original invoice number and date",
            why: "Notice 700 asks for both, so a client can match the credit to the right VAT invoice.",
        },
        {
            name: "Quantity and amount for each item",
            why: "List them line by line, not as one lump sum.",
        },
        {
            name: "Rate and amount of VAT, in sterling",
            why: "Show these apart from the total credited before VAT, even on a foreign currency bill.",
        },
    ],
    tips: [
        {
            title: "Make sure the reason is a real one",
            text: "Notice 700 says a valid credit note must reflect a genuine mistake, an overcharge or an agreed cut in value, and a genuine claim by the customer. It isn't a way to move VAT around.",
        },
        {
            title: "Say so if the VAT stays where it is",
            text: "If you issue a credit note without adjusting the VAT, HMRC wants it to state: This is not a credit note for VAT. Add that line where it applies, because a client could otherwise claim the wrong amount.",
        },
        {
            title: "Count the 14 days from the refund",
            text: "The clock runs from the day you pay the refund. Sending the money and the note on one day is the simple habit, and then you never need to check the date.",
        },
    ],
    faqs: [
        {
            question: "What must a UK credit note show for VAT?",
            answer: "Paragraph 18.2.3 lists an identifying number and date, your name, address and VAT number, your customer's name and address, a description, quantity and amount, the total before VAT, the VAT rate and amount, and the original invoice details.",
        },
        {
            question: "When isn't a British credit note valid for VAT?",
            answer: "HMRC's list has three tests: a genuine mistake, overcharge or agreed reduction; a note issued within 14 days of the refund; and a real entitlement for your customer. Miss one and it won't count for VAT.",
        },
        {
            question: "Can I issue a UK credit note if I'm not VAT registered?",
            answer: "Yes, as a plain correction. Your own books still need it, so use your usual numbering. Just leave out the VAT number and VAT line, as there's no tax for your customer to reverse.",
        },
    ],
    band: {
        title: "A UK credit note HMRC can follow.",
        line: "Issue it in Saroh and it stays attached to the VAT invoice and the client, so your numbers still add up.",
    },
};
