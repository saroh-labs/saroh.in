import type { Combo } from "../types";

export const proformaInvoiceEventPlanner: Combo = {
    document: "proforma-invoice",
    trade: "event-planner",
    reviewed: false,
    lede: "For the corporate client whose finance team must see the numbers before you can start booking suppliers. Set out the stages, and what it will all come to.",
    items: [
        {
            line: "Conference planning",
            billedBy: "Flat fee per event",
            description: "Conference planning fee",
            qty: "1",
            rate: "4000",
        },
        {
            line: "Delegate registration",
            billedBy: "Per delegate",
            description: "Delegate sign-up and badges",
            qty: "200",
            rate: "5",
        },
        {
            line: "Hall hire",
            billedBy: "Per day, at cost",
            description: "Conference hall hire, days",
            qty: "2",
            rate: "1500",
        },
        {
            line: "Delegate catering",
            billedBy: "Per delegate, per day",
            description: "Lunch and coffee, delegate days",
            qty: "400",
            rate: "25",
        },
        {
            line: "Stage and screens",
            billedBy: "Per day",
            description: "Stage, screens and sound, days",
            qty: "2",
            rate: "1000",
        },
        {
            line: "Registration staff",
            billedBy: "Per person, per day",
            description: "Registration desk staff",
            qty: "4",
            rate: "150",
        },
    ],
    fields: [
        {
            name: "Cost centre or purchase order",
            why: "A corporate buyer's system usually won't release money without this.",
        },
        {
            name: "Supplier deadlines",
            why: "Say when your hold on the hall runs out, so approval doesn't lag behind it.",
        },
        {
            name: "The word Proforma",
            why: "It tells accounts this is for approval, and is not yet a payable bill.",
        },
    ],
    example: {
        number: "PRO-0001",
        issued: "2026-02-16",
        due: "2026-03-09",
        client: { name: "Company name", email: "events@example.com" },
        facts: [
            { label: "Event dates", value: "12 and 13 Jun" },
            { label: "Delegates", value: "200" },
            { label: "Hall held until", value: "9 Mar" },
        ],
        note: "This proforma is for approval. Real invoices follow by stage, once the order is placed.",
    },
    tips: [
        {
            title: "Put your hold dates on the page",
            text: "A hall is only held so long. When finance sees a date it will lose the space, your proforma moves up the pile, and you aren't the one chasing.",
        },
        {
            title: "Separate fees from pass-through costs",
            text: "Finance teams often code your service differently from a venue's hire or the food. A line for each spares them a phone call, and gets you approved sooner.",
        },
        {
            title: "Give the amount for each stage",
            text: "A big company's budget may run across two periods. Show what falls due in each, so the person approving it can decide which budget each stage belongs to.",
        },
    ],
    faqs: [
        {
            question: "Can I start booking suppliers on a proforma alone?",
            answer: "It's risky, since it binds nobody. Wait for a purchase order or signed agreement, or at least written approval from someone who can give it. If a hold is free, take that in the meantime.",
        },
        {
            question:
                "A sponsor is paying for part of this conference. How do I show that?",
            answer: "Send a separate proforma to the sponsor, for just their share. Name the event on both, and give each its own number. Mixing payers on one document makes it hard for either to approve.",
        },
        {
            question: "What if delegate numbers are still unknown at approval?",
            answer: "Show the number you've assumed and the rate per delegate, so someone can scale it. Add a date when the final count is due, and say the real invoice uses that count.",
        },
    ],
};
