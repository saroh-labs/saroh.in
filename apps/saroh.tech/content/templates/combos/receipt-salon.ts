import type { Combo } from "../types";

export const receiptSalon: Combo = {
    document: "receipt",
    trade: "salon",
    reviewed: false,
    lede: "The slip for the desk: every service and product from today's visit, the stylist's name, any tip and how it was paid. Keep it simple enough to send in seconds.",
    items: [
        {
            line: "Service",
            billedBy: "Per service",
            description: "Cut and blow-dry, with stylist name",
            qty: "1",
            rate: "50",
        },
        {
            line: "Colour",
            billedBy: "Per service",
            description: "Root colour",
            qty: "1",
            rate: "60",
        },
        {
            line: "Product sold",
            billedBy: "Per item",
            description: "Colour-safe shampoo",
            qty: "1",
            rate: "20",
        },
        {
            line: "Gift card sold",
            billedBy: "Per card",
            description: "Gift card, not a service",
            qty: "1",
            rate: "50",
        },
        {
            line: "Prepaid blow-dry pack",
            billedBy: "Per pack",
            description: "Pack of 5 blow-dries",
            qty: "1",
            rate: "100",
        },
        {
            line: "Tip",
            billedBy: "As given",
            description: "Tip for stylist",
            qty: "1",
            rate: "5",
        },
    ],
    payment: {
        text: "Salon receipts are written at the desk, after the visit, and often in a queue. Show each service and product, then how it was paid, including any gift card used.",
        points: [
            "Card, cash or gift card",
            "Tips on a line of their own",
            "Gift cards shown with their remaining value",
        ],
    },
    fields: [
        {
            name: "Stylist's name",
            why: "Clients want to rebook with the same person, and it helps split your takings.",
        },
        {
            name: "Gift card balance",
            why: "A printed balance saves a call to the desk the next time they visit.",
        },
        {
            name: "Next appointment",
            why: "A date on the slip is an easy reminder that gets the next visit booked.",
        },
    ],
    example: {
        number: "RCT-0001",
        issued: "2026-03-14",
        client: { name: "Client name", email: "client@example.com" },
        facts: [
            { label: "Paid on", value: "14 Mar 2026" },
            { label: "Paid by", value: "Card" },
            { label: "Next visit", value: "11 Apr, 10:00 am" },
        ],
        note: "Thanks for coming in. Products can be swapped within 14 days if unopened.",
    },
    tips: [
        {
            title: "Show services and products apart",
            text: "Tax treatment, commission and the client's own memory all work better with two clear groups. A shampoo sold on the way out shouldn't blur with the cut.",
        },
        {
            title: "Treat tips as the stylist's line",
            text: "A separate line lets the client see they've tipped, and helps your records show what's owed to whom. Handle how tips are taxed according to your local rules.",
        },
        {
            title: "Use the receipt to rebook",
            text: "A date for the next visit sits right where the client is already looking. It turns a slip of paper into a reminder, and it costs you nothing to add.",
        },
    ],
    faqs: [
        {
            question: "Is selling a gift card the same as selling a service?",
            answer: "Not for your records. The money comes now, but the haircut comes later. Show it as a gift card sold, and when it's used, show that as the method of payment on that later receipt.",
        },
        {
            question:
                "How do I write a receipt for a client who shares a card with a friend?",
            answer: "One payment, one receipt, with both visits listed if they want. If they'd like to split the cost, two receipts with each person's own services is cleaner, and it's only one more click.",
        },
        {
            question:
                "A client wants a refund for a product they've opened. What do I record?",
            answer: "That's your policy to set, within local consumer rules. If you do refund it, issue a new note saying what came back, with the amount and date. Leave the first receipt as it was.",
        },
    ],
    band: {
        title: "Paid, printed, booked again.",
        line: "Send a receipt by email from the desk, and keep the record with the client's name. 0% fees.",
    },
};
