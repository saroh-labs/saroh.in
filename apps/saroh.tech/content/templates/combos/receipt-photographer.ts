import type { Combo } from "../types";

export const receiptPhotographer: Combo = {
    document: "receipt",
    trade: "photographer",
    reviewed: false,
    lede: "Confirm a booking deposit, a balance or a print order, with the shoot date on it, so a couple can show what's paid and what's left.",
    items: [
        {
            line: "Portrait session",
            billedBy: "Per session",
            description: "Family portrait session",
            qty: "1",
            rate: "250",
        },
        {
            line: "Digital files",
            billedBy: "Per image",
            description: "Digital files",
            qty: "10",
            rate: "15",
        },
        {
            line: "Wall prints",
            billedBy: "Per print",
            description: "Framed print, large",
            qty: "2",
            rate: "120",
        },
        {
            line: "Small prints",
            billedBy: "Per print",
            description: "Small prints",
            qty: "12",
            rate: "5",
        },
        {
            line: "Album",
            billedBy: "Per album",
            description: "Family album",
            qty: "1",
            rate: "200",
        },
        {
            line: "Delivery",
            billedBy: "A flat fee",
            description: "Framed print delivery",
            qty: "1",
            rate: "20",
        },
    ],
    payment: {
        text: "A shoot can bring in money three times: at booking, before the day and when prints are ordered. Each payment deserves its own receipt, and each should show what remains.",
        points: [
            "A receipt for the deposit, marked as a deposit",
            "A second one when the balance arrives",
            "A new one for each later print order",
        ],
    },
    fields: [
        {
            name: "Shoot date",
            why: "A deposit can arrive a year early, so this says which day the money is holding.",
        },
        {
            name: "Deposit or balance",
            why: "The word stops a part payment reading as if nothing more is owed.",
        },
        {
            name: "Print order number",
            why: "If a frame arrives damaged, this finds the order quickly with you and the lab.",
        },
    ],
    example: {
        number: "RCT-0106",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Card" },
            { label: "Session date", value: "30 May 2026" },
        ],
        note: "Prints are for personal use. Framed prints arrive within 3 weeks.",
    },
    tips: [
        {
            title: "Mark deposits as deposits",
            text: "A couple may keep their receipt in a wedding folder for a year. If the word deposit is at the top, nobody later thinks that the whole package was paid.",
        },
        {
            title: "Write the remaining balance and date",
            text: "State the sum left and when it falls due. The receipt becomes a gentle reminder sitting in their inbox, so you won't need to write a harder message close to the day.",
        },
        {
            title: "Give print orders a receipt of their own",
            text: "Sales after the shoot get muddled with the session fee. A separate paper, with its own number, is simple to match when a grandparent's album needs to be chased at the lab.",
        },
    ],
    faqs: [
        {
            question:
                "A parent paid towards the wedding. Whose name goes on the receipt?",
            answer: "Use the name of the person whose money it was, and add the couple's names beside the shoot date. If that parent paid only one part, the receipt should say so. Everyone can then see who covered what.",
        },
        {
            question:
                "Does a family need a receipt for prints paid in cash at the studio?",
            answer: "Give one anyway. Write the print sizes and quantity. A damaged or wrong print is hard to sort out with nothing on paper, and cash leaves no other mark for either of you to look back at.",
        },
        {
            question: "A gift voucher was used for a session. What do I write?",
            answer: "Name the voucher and its number, and show the amount it covered. If the person added money for prints, list that part with its method. Keep the original sale of the voucher on a separate receipt of its own.",
        },
        {
            question:
                "What if a couple's deposit is refunded after a cancellation?",
            answer: "The first receipt stays as it was, because the money did arrive. Record the refund as a new document that names the first number, with its date and amount. Then your records show both events honestly.",
        },
    ],
};
