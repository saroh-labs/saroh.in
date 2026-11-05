import type { DocumentData } from "../types";

export const creditNote: DocumentData = {
    slug: "credit-note",
    name: "Credit note",
    chip: "Credit note",
    line: "Correct or cancel part of an invoice you already sent.",
    reviewed: false,
    lede: "A credit note takes money off an invoice you've already sent, so you don't have to edit or delete it. Use it for returns, overcharges and work you ended up not doing.",
    items: [
        {
            line: "Returned goods",
            billedBy: "Per unit returned",
            description: "Linen napkins, returned damaged",
            qty: "24",
            rate: "6",
        },
        {
            line: "Overcharge",
            billedBy: "The difference",
            description: "Tablecloths, price corrected",
            qty: "10",
            rate: "4",
        },
        {
            line: "Cancelled part of the order",
            billedBy: "The line as invoiced",
            description: "Chair covers, not delivered",
            qty: "30",
            rate: "3",
        },
        {
            line: "Delivery",
            billedBy: "The fee as invoiced",
            description: "Second delivery, not made",
            qty: "1",
            rate: "40",
        },
        {
            line: "Goodwill",
            billedBy: "An agreed amount",
            description: "Goodwill credit for late order",
            qty: "1",
            rate: "50",
        },
        {
            line: "Restocking",
            billedBy: "Refunded fee",
            description: "Restocking fee, waived",
            qty: "1",
            rate: "25",
        },
    ],
    payment: {
        text: "A credit note reduces what your client owes. If the invoice is unpaid, they simply pay less. If they've already paid, you refund the money or hold it against the next bill, whichever you both agree in writing.",
        points: [
            "Taken off an unpaid invoice",
            "Refunded, if the invoice is already paid",
            "Kept as credit toward the client's next order",
        ],
    },
    fields: [
        {
            name: "The original invoice number",
            why: "A credit note means little without the invoice it corrects, so name it clearly.",
        },
        {
            name: "The reason",
            why: "One short phrase like 'returned damaged' answers the question your client's accounts team will ask.",
        },
        {
            name: "Credit note number",
            why: "Give it a number of its own, in its own sequence, as you do with invoices.",
        },
    ],
    example: {
        number: "CN-0001",
        issued: "2026-08-10",
        due: "",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Willow Table Linen",
            email: "billing@example.com",
            address: "3 Weavers Row",
        },
        client: {
            name: "The Old Mill Hotel",
            email: "accounts@example.com",
            address: "1 River Walk",
        },
        facts: [
            { label: "Against invoice", value: "INV-0417" },
            { label: "Reason", value: "Goods returned, order changed" },
        ],
        note: "This credit reduces invoice INV-0417. It will be refunded to the card used, within 5 working days.",
    },
    tips: [
        {
            title: "Don't edit the old invoice",
            text: "Once sent, an invoice is part of the record. Changing it quietly breaks your numbers and can upset a tax check. Leave it alone, and let the credit note do the correcting.",
        },
        {
            title: "Match the tax on the original",
            text: "If the invoice charged tax, the credit note takes tax back at the same rate. Otherwise your tax return shows tax on a sale that, in part, never really happened.",
        },
        {
            title: "Write amounts as plain figures",
            text: "The heading already says this is a credit, so minus signs on every line only confuse people. Reserve the minus for one place, if you need one: the total in your own accounts.",
        },
    ],
    faqs: [
        {
            question: "When should I issue a credit note?",
            answer: "Whenever an invoice you've sent turns out too high: goods come back, you overcharged, part of an order is cancelled, or you agree a goodwill reduction. Use a new invoice instead if the original was too low, since extra money is owed.",
        },
        {
            question: "Is a credit note the same as a refund?",
            answer: "No. The credit note is the paperwork that says the amount is lower. A refund is the money actually going back. You might issue a credit note with no refund at all, if the invoice hadn't been paid yet.",
        },
        {
            question: "Can I just cancel an invoice instead?",
            answer: "Deleting an invoice leaves a gap in your numbering, and that's what an accountant or tax office will question. To cancel a whole invoice properly, issue a credit note for the full amount, so both documents stay on record.",
        },
        {
            question: "How do I show a credit note in my accounts?",
            answer: "It reduces your sales for the period, along with any tax on it. Most accounting tools have a credit note option that handles this for you. If you keep a simple spreadsheet, enter it as a negative line beside the invoice.",
        },
    ],
};
