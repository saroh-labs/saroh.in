import type { Combo } from "../types";

export const receiptEventPlanner: Combo = {
    document: "receipt",
    trade: "event-planner",
    reviewed: false,
    lede: "Record each stage payment, and money held for suppliers, with the event named and a running total, so a long event's books stay simple to read.",
    items: [
        {
            line: "Booking stage",
            billedBy: "Per stage",
            description: "Stage 1 of 3, booking",
            qty: "1",
            rate: "1000",
        },
        {
            line: "Mid-way stage",
            billedBy: "Per stage",
            description: "Stage 2 of 3, 60 days before",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Held for caterer",
            billedBy: "Passed to supplier",
            description: "Money held for caterer's deposit",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Held for florist",
            billedBy: "Passed to supplier",
            description: "Money held for florist's deposit",
            qty: "1",
            rate: "400",
        },
        {
            line: "Damage deposit",
            billedBy: "Refundable, per event",
            description: "Refundable hire damage deposit",
            qty: "1",
            rate: "500",
        },
        {
            line: "Consultation",
            billedBy: "Per session",
            description: "First planning consultation",
            qty: "1",
            rate: "100",
        },
    ],
    payment: {
        text: "An event planner may receive several payments across months, and some of that money only passes through on its way to suppliers. Each receipt should say which is which.",
        points: [
            "Your fee kept apart from supplier money",
            "Refundable deposits named as refundable",
            "Running total paid towards the event",
        ],
    },
    fields: [
        {
            name: "Event name and date",
            why: "A client planning two events needs to see which one each payment went to.",
        },
        {
            name: "Stage number",
            why: "Stage 2 of 3 tells them what they've paid and what's still coming.",
        },
        {
            name: "Total paid so far",
            why: "Few people keep their own running sum, and they will ask for yours.",
        },
    ],
    example: {
        number: "RCT-0002",
        issued: "2026-02-09",
        facts: [
            { label: "Paid on", value: "9 Feb 2026" },
            { label: "Paid by", value: "Bank transfer" },
            { label: "Event", value: "Summer party, 14 Jun" },
        ],
        note: "Money held for suppliers is passed on as agreed. The damage deposit comes back after the event, less any agreed claims.",
    },
    tips: [
        {
            title: "Keep supplier money visibly separate",
            text: "A deposit you'll forward to a caterer isn't your income. Naming it on the receipt keeps your own accounts straight, and shows your client where their money went.",
        },
        {
            title: "Say when a damage deposit comes back",
            text: "Clients forget it, then panic. Give a date, such as 14 days after the event, and what it could be reduced by. Then send a brief note when you return it.",
        },
        {
            title: "Quote the stage from your agreement",
            text: "Use the same stage names as your quote. Someone checking months later can match this receipt to the payment plan in one look, without having to call you.",
        },
    ],
    faqs: [
        {
            question:
                "Does a company client need anything extra on an event receipt?",
            answer: "Often a cost centre, purchase order number or the staff member who booked. Include whatever appears on their order. An expenses team may also want the event's purpose, so give it one clear plain name.",
        },
        {
            question: "I refunded part of a damage deposit. What do I issue?",
            answer: "Send a short note or a new receipt showing the amount returned, the date and any amount kept with its reason. Attach the venue's letter or bill. Keep both in the event file you already hold.",
        },
        {
            question:
                "Can one receipt cover money from both families at a wedding?",
            answer: "Better not. Give each payer their own receipt with their own amount, since they may wish to keep track apart. Add a shared event reference, so you can still see the full total in one view.",
        },
    ],
};
