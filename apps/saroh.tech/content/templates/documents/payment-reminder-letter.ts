import type { DocumentData } from "../types";

export const paymentReminderLetter: DocumentData = {
    slug: "payment-reminder-letter",
    name: "Payment reminder letter",
    chip: "Reminder letter",
    line: "Ask politely, in writing, for an overdue payment.",
    reviewed: false,
    lede: "A payment reminder letter lists what's overdue and asks for it by a set date, without sounding angry. It suits a client with more than one unpaid bill, or one who has ignored your emails.",
    items: [
        {
            line: "Oldest invoice first",
            billedBy: "The invoice's amount",
            description: "INV-0201, January bookkeeping",
            qty: "1",
            rate: "200",
        },
        {
            line: "Next invoice",
            billedBy: "The invoice's amount",
            description: "INV-0212, February bookkeeping",
            qty: "1",
            rate: "200",
        },
        {
            line: "One-off work",
            billedBy: "The invoice's amount",
            description: "INV-0218, year-end accounts",
            qty: "1",
            rate: "450",
        },
        {
            line: "Another month",
            billedBy: "The invoice's amount",
            description: "INV-0224, March bookkeeping",
            qty: "1",
            rate: "200",
        },
        {
            line: "Extra work billed",
            billedBy: "The invoice's amount",
            description: "INV-0229, tax return help",
            qty: "1",
            rate: "150",
        },
        {
            line: "Most recent invoice",
            billedBy: "The invoice's amount",
            description: "INV-0233, April bookkeeping",
            qty: "1",
            rate: "200",
        },
    ],
    payment: {
        text: "A letter works best after a friendly email or two has gone unanswered. Give one clear new date and one easy way to pay. Offer to talk it through, because a client in trouble may need a plan, not pressure.",
        points: [
            "First note: friendly, the day after the due date",
            "Letter: firm, with a new pay-by date",
            "Final notice: what happens next, and when",
        ],
    },
    fields: [
        {
            name: "Every invoice number and amount",
            why: "Clients pay faster when they don't have to dig out what you're talking about.",
        },
        {
            name: "A new pay-by date",
            why: "'As soon as possible' has no end. A real date gives both of you something to hold to.",
        },
        {
            name: "How to pay, again",
            why: "Repeat the payment link or bank details here, even though they were on the invoice.",
        },
    ],
    example: {
        number: "REM-0001",
        issued: "2026-09-07",
        due: "2026-09-21",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Brightside Bookkeeping",
            email: "office@example.com",
            address: "44 Canal Street",
        },
        client: {
            name: "Rosa Lindqvist, Tandem Bikes",
            email: "rosa@example.com",
            address: "6 Wheel Lane",
        },
        letter: "Dear Rosa,\nOur records show that the invoices above are still unpaid. If you've already paid them, thank you, and please let me know the date so I can match it up. If not, please pay the total by 21 September. If something's wrong, or you'd like to pay in stages, call me and we can agree a plan.",
    },
    tips: [
        {
            title: "Assume it was missed",
            text: "Open by treating the late payment as an oversight, even if you doubt it. Clients who feel accused dig in. Clients given an easy way out usually just pay.",
        },
        {
            title: "Put the total in one place",
            text: "List the invoices, add them up and show one number. Your client shouldn't need a calculator or your earlier emails to understand exactly how much you are asking for.",
        },
        {
            title: "Only warn what you'd really do",
            text: "If you say you'll stop work or pass it to collections, be ready to do it. An empty threat teaches a slow payer that your deadlines don't mean anything.",
        },
    ],
    faqs: [
        {
            question: "When should I send a payment reminder letter?",
            answer: "After a polite email or message hasn't worked, often a week or two past the due date. Sending a letter on day one feels heavy, while waiting two months tells the client that being late carries no cost at all.",
        },
        {
            question: "Should a reminder letter mention late fees?",
            answer: "Only if your original terms allowed for them, or your local law gives you that right. Then state the amount and how you worked it out. A surprise fee, with no agreement behind it, tends to start an argument instead of a payment.",
        },
        {
            question: "How many reminders should I send?",
            answer: "Three is a sensible pattern: a friendly nudge, a firm letter, then a final notice stating what happens next. After that, more reminders won't help. Talk to them directly, stop further work, or look at formal debt recovery.",
        },
        {
            question: "What if the client says they can't pay right now?",
            answer: "Get an honest figure and date from them, and offer to split the balance into stages if you can. Write down what you both agreed. A slow payment plan beats a dispute, and it keeps the door open for later work.",
        },
    ],
};
