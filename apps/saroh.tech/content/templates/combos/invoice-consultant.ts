import type { Combo } from "../types";

export const invoiceConsultant: Combo = {
    document: "invoice",
    trade: "consultant",
    reviewed: false,
    lede: "Set up for advice work: days worked, retainer months, workshops, expenses with receipts and the purchase order number finance won't pay without. Fill it online, or download the file.",
    example: { number: "INV-0530", terms: "net30", due: "2026-04-30" },
    tips: [
        {
            title: "Get the PO number before day one",
            text: "A bill without one can sit in a queue for weeks, then bounce. Ask the person who hired you who raises it, and hold off starting until the number exists.",
        },
        {
            title: "Send it to accounts and your contact",
            text: "The person who hired you can vouch for the work. Finance can release the money. Copy both, name the sponsor on the bill, and neither can say they never got it.",
        },
        {
            title: "Bundle expenses with their receipts",
            text: "Attach scans in one file, and list the totals by trip. A finance clerk checking a hotel bill against a line can sign it off without sending you a query.",
        },
    ],
    faqs: [
        {
            question: "How do I show a retainer that ran over its hours?",
            answer: "Bill the retainer at its usual amount, then add a separate line for hours above the limit. Say how many were included and how many were used. It helps to warn the client when you reach about three quarters of the time.",
        },
        {
            question: "Do I charge for travel time as well as travel costs?",
            answer: "Decide this in your contract, not on the bill. Some consultants charge a share of their day rate for long journeys, and some absorb it. If you do charge, keep it separate from the fares so it's easy to see.",
        },
        {
            question: "What if a day was only half worked?",
            answer: "Say up front whether you bill in half days or in full ones. Then show half days as 0.5 in the quantity column. An unexplained full day for an afternoon's work is the sort of line a client remembers.",
        },
        {
            question:
                "The client wants me on their supplier system. Does that change the invoice?",
            answer: "It can. Some large companies need bills submitted through their own portal, with details matching your supplier record exactly. Register early, because it can take weeks, and match your name, bank details and PO number to what they hold.",
        },
    ],
};
