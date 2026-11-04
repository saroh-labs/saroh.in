import type { Combo } from "../types";

export const receiptWebDeveloper: Combo = {
    document: "receipt",
    trade: "web-developer",
    reviewed: false,
    lede: "Confirm a milestone or care plan payment, with the site, the stage and the period it covers, so a client's bookkeeper can match it without asking you.",
    items: [
        {
            line: "Milestone",
            billedBy: "A fixed fee per stage",
            description: "Milestone 2 of 4, payment",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Support hours",
            billedBy: "Per hour",
            description: "Support hours, May",
            qty: "5",
            rate: "60",
        },
        {
            line: "Care plan",
            billedBy: "Per month",
            description: "Care plan, June",
            qty: "1",
            rate: "80",
        },
        {
            line: "Hosting renewal",
            billedBy: "Per year",
            description: "Hosting, 12 months",
            qty: "1",
            rate: "180",
        },
        {
            line: "Domain renewal",
            billedBy: "Per year, at cost",
            description: "Domain renewal",
            qty: "1",
            rate: "20",
        },
        {
            line: "Plugin licence",
            billedBy: "Per year, at cost",
            description: "Booking plugin, yearly licence",
            qty: "1",
            rate: "100",
        },
    ],
    payment: {
        text: "Payments on a web project arrive in stages and then repeat for care plans. Each receipt should say which stage or which months it settles, so the running total stays clear.",
        points: [
            "One receipt for each milestone payment",
            "A receipt each time a care plan renews",
            "Say which months or year a renewal covers",
        ],
    },
    fields: [
        {
            name: "Milestone or period paid",
            why: "It says at a glance if this settled stage 2 or the whole build.",
        },
        {
            name: "Renewal dates",
            why: "For hosting and domains, the next renewal date saves a panicked email a year on.",
        },
        {
            name: "Still to pay",
            why: "On a staged build, showing the remaining stages stops a client thinking they're finished.",
        },
    ],
    example: {
        number: "RCT-0423",
        facts: [
            { label: "Paid on", value: "8 Jun 2026" },
            { label: "Paid by", value: "Payment link" },
            { label: "Site", value: "shop.example.com" },
        ],
        note: "Milestones 3 and 4 are still to come. Hosting next renews on 8 Jun 2027.",
    },
    tips: [
        {
            title: "Print the next renewal date",
            text: "A hosting or domain receipt is the one piece of paper a client keeps. If the date is on it, they can't later say nobody warned them the site would lapse.",
        },
        {
            title: "Show which stages are left",
            text: "A short note that stages 3 and 4 are still to come stops a founder thinking the project's paid off. It also keeps your next bill from being a surprise.",
        },
        {
            title: "Name renewals passed on at cost",
            text: "Where you paid a yearly licence on a client's behalf, say so. Their accountant can see it's a software cost and not your fee, and you won't field the question in March.",
        },
    ],
    faqs: [
        {
            question:
                "My client pays a care plan by standing order. Do I send a receipt each month?",
            answer: "Only if they want one. You could send a single statement once a quarter or once a year that lists each payment and month. A business with tight bookkeeping may prefer one per month, so ask them when the plan starts.",
        },
        {
            question:
                "What goes on a receipt for a refund of unused support hours?",
            answer: "Don't use a normal receipt. Issue a credit note for the unused hours, then record the money going back. Name the prepaid block and the hours left over, so both sets of books show the same balance.",
        },
        {
            question:
                "A client paid in a foreign currency. What amount do I show?",
            answer: "Show the amount and currency you actually received, along with the invoice it settles. If your bank took a conversion fee and the sum fell short, write that as a separate note and agree who covers the gap.",
        },
        {
            question: "Should the receipt confirm the site was handed over?",
            answer: "It can, in one line with a date. That helps at the end of a build, when logins and code change hands. Keep the full handover details somewhere safer, and never print a password or login on a receipt.",
        },
    ],
};
