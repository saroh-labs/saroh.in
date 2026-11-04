import type { Combo } from "../types";

export const invoicePersonalTrainer: Combo = {
    document: "invoice",
    trade: "personal-trainer",
    reviewed: false,
    lede: "Bill the sessions you ran, the programme you wrote and the month of online coaching, each on its own line. Fill it online, or download the file.",
    example: { number: "INV-0001", issued: "2026-03-28", due: "2026-04-11" },
    tips: [
        {
            title: "List sessions by week",
            text: "A client who trained on and off will doubt a bare count of eight. Name the dates beside the line, and the question of which Tuesday they missed answers itself.",
        },
        {
            title: "Bill a no-show as its own line",
            text: "Mixed in with the real sessions, a missed hour looks like padding. Written apart as a late cancellation, with your notice rule beside it, it reads as a term they agreed to.",
        },
        {
            title: "Keep the programme apart from coaching",
            text: "The plan you wrote is finished work. The hours in the gym are ongoing. Separate lines let a client stop the sessions and still see that the plan was paid for.",
        },
    ],
    faqs: [
        {
            question:
                "Can I charge for a session the client cancelled an hour before?",
            answer: "Yes, if they agreed to your cancellation rule before they started. Put the rule in your first message or sign-up form, then quote it on the bill. Without a written rule, it's a favour you are asking for, and you may lose it.",
        },
        {
            question: "How do I show the gym's fee when I train someone there?",
            answer: "If the client pays it through you, add a line per visit called gym entry. If it's your own rent for using the floor, it's your business cost, so build it into your session rate and leave it off the bill.",
        },
        {
            question:
                "A company is paying for its staff to train. What changes?",
            answer: "Put the company as the client and each person's name in the description, with their session count. Ask for a purchase order number if they use them. Finance teams pay faster when the bill matches what they approved.",
        },
        {
            question:
                "Should I invoice for a pack the client has already paid for?",
            answer: "No second bill is needed. Send a receipt for the payment, and keep the count of sessions used on your own record. Only invoice again when the pack runs out or they add extras such as a new programme.",
        },
    ],
    band: {
        title: "Trained, billed, paid.",
        line: "Keep every session and every invoice in one place. 0% fees.",
    },
};
