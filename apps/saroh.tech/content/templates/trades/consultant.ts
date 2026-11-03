import type { TradeData } from "../types";

export const consultant: TradeData = {
    reviewed: false,
    lede: "Made for advice work: day rates, retainers, workshops, written reports and the expenses you pass on, with the purchase order a finance team asks for.",
    items: [
        {
            line: "Consulting days",
            billedBy: "Per day",
            description: "Consulting days, on site",
            qty: "4",
            rate: "800",
        },
        {
            line: "Advice calls",
            billedBy: "Per hour",
            description: "Advice calls, hours",
            qty: "5",
            rate: "120",
        },
        {
            line: "Retainer",
            billedBy: "Per month",
            description: "Monthly retainer, up to 10 hours",
            qty: "1",
            rate: "1000",
        },
        {
            line: "Workshop",
            billedBy: "Per session",
            description: "Half-day team workshop",
            qty: "1",
            rate: "600",
        },
        {
            line: "Written report",
            billedBy: "A fixed fee",
            description: "Findings and next steps report",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Expenses",
            billedBy: "At cost, with receipts",
            description: "Train fares and hotel",
            qty: "1",
            rate: "250",
        },
    ],
    payment: {
        text: "Larger clients often pay through a finance team, on the terms in your contract. Retainers are usually billed at the start of the month, and project days at the end.",
        points: [
            "Retainer billed in advance each month",
            "Days worked billed in arrears",
            "Expenses passed on at cost, with receipts",
        ],
    },
    fields: [
        {
            name: "Purchase order number",
            why: "Many finance teams can't pay a bill without one, so ask for it at the start.",
        },
        {
            name: "Period covered",
            why: "The dates show which days or which month of the retainer this bill is for.",
        },
        {
            name: "Named contact",
            why: "The person who hired you can approve the bill when finance asks them.",
        },
    ],
    example: {
        from: {
            name: "Your Consulting Co",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client company", address: "Accounts payable" },
        facts: [
            { label: "PO number", value: "PO-4471" },
            { label: "Period", value: "1 to 31 Mar" },
        ],
        note: "Approved by your project lead. Expense receipts are attached.",
    },
};
