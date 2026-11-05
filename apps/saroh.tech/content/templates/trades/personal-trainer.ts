import type { TradeData } from "../types";

export const personalTrainer: TradeData = {
    reviewed: false,
    lede: "Built for coaching: sessions and packs, programme writing, online check-ins and the gym fee you pay to train someone. Pick the document you need.",
    items: [
        {
            line: "One-to-one session",
            billedBy: "Per session",
            description: "One-to-one session, 1 hour",
            qty: "8",
            rate: "60",
        },
        {
            line: "Session pack",
            billedBy: "Per pack",
            description: "Pack of 10 sessions",
            qty: "1",
            rate: "500",
        },
        {
            line: "Programme design",
            billedBy: "Per programme",
            description: "12-week strength programme",
            qty: "1",
            rate: "150",
        },
        {
            line: "Online coaching",
            billedBy: "Per month",
            description: "Online coaching and weekly check-in, months",
            qty: "2",
            rate: "100",
        },
        {
            line: "Fitness assessment",
            billedBy: "Per assessment",
            description: "Starting fitness assessment",
            qty: "1",
            rate: "40",
        },
        {
            line: "Home visit travel",
            billedBy: "Per trip",
            description: "Travel to client's home, trips",
            qty: "8",
            rate: "10",
        },
    ],
    payment: {
        text: "Coaching is often paid before the sessions happen, as a pack or a monthly fee. Write down how many sessions the money buys, and how long the client has to use them.",
        points: [
            "Packs paid up front, before the first session",
            "Monthly coaching billed at the start of each month",
            "Late cancellations count as a used session, if your terms say so",
        ],
    },
    fields: [
        {
            name: "Session dates",
            why: "A client comparing their diary with the bill wants to see which weeks it covers.",
        },
        {
            name: "Sessions left in the pack",
            why: "It stops the slow argument about whether seven or eight have been used.",
        },
        {
            name: "Cancellation notice",
            why: "One line on how many hours' notice you need makes a missed session easy to bill.",
        },
    ],
    example: {
        from: {
            name: "Your Coaching Name",
            email: "coach@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Sessions", value: "2 Mar to 27 Mar" },
            { label: "Training at", value: "Client's home" },
        ],
        note: "Sessions cancelled with under 24 hours' notice are charged in full.",
    },
};
