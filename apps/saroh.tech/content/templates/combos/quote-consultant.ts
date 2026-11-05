import type { Combo } from "../types";

export const quoteConsultant: Combo = {
    document: "quote",
    trade: "consultant",
    reviewed: false,
    lede: "A fixed fee for defined advice: the stages, the deliverables, the workshops and what's out of scope, in a form a sponsor can sign and finance can approve.",
    items: [
        {
            line: "Review stage",
            billedBy: "A fixed fee",
            description: "Stage 1: operations review",
            qty: "1",
            rate: "4000",
        },
        {
            line: "Strategy stage",
            billedBy: "A fixed fee",
            description: "Stage 2: 12-month plan",
            qty: "1",
            rate: "5000",
        },
        {
            line: "Leadership workshops",
            billedBy: "Per workshop",
            description: "Leadership workshops, half day",
            qty: "2",
            rate: "600",
        },
        {
            line: "Board paper",
            billedBy: "A fixed fee",
            description: "Board paper and presentation",
            qty: "1",
            rate: "1000",
        },
        {
            line: "Follow-up support",
            billedBy: "Per month",
            description: "Support calls after handover",
            qty: "3",
            rate: "500",
        },
        {
            line: "Travel",
            billedBy: "A capped amount",
            description: "Travel, capped",
            qty: "1",
            rate: "400",
        },
    ],
    payment: {
        text: "Fixed fees suit stages that end with a named deliverable. Bill when each one is handed over, and match the wording to the purchase order so finance can pass it quickly.",
        points: [
            "A first payment on signing",
            "A payment as each stage is delivered",
            "Monthly support billed in advance",
        ],
    },
    fields: [
        {
            name: "Deliverables",
            why: "Name what the client will hold at the end, such as a report or a plan, not just your time.",
        },
        {
            name: "Sponsor and signature",
            why: "Say who has authority to accept. It may not be the person you've been talking to.",
        },
        {
            name: "Confidentiality",
            why: "One line pointing to your agreement reassures a client handing over sensitive data.",
        },
    ],
    example: {
        number: "Q-0532",
        facts: [
            { label: "Engagement", value: "Operations plan" },
            { label: "Sponsor", value: "Chief Operating Officer" },
        ],
        note: "Purchase order required before work begins.",
        termsText:
            "Fee covers the stages and deliverables listed. Added work is quoted separately. Travel is billed at cost, up to the cap shown.",
    },
    tips: [
        {
            title: "Sell the deliverable, not the hours",
            text: "A 12-month plan handed to the board is easier to value than forty hours of thinking. Clients also stop counting your time, which leaves you free to work efficiently.",
        },
        {
            title: "Cap the travel",
            text: "Finance dislikes open-ended lines. A capped amount, billed at cost, gives them a number for the purchase order and shows that you'll book trains with some care for their budget.",
        },
        {
            title: "Limit the review cycles",
            text: "Reports can go round a committee for months. Say how many sets of comments the fee includes, and who collects them, or your fixed fee melts as more people read the draft.",
        },
    ],
    faqs: [
        {
            question: "Should a consultant give a fixed fee or a day rate?",
            answer: "A fixed fee works when the outcome is clear and you've done similar work. A day rate is fairer when the client controls the pace. If a client insists on seeing days, show them as an assumption behind the fee.",
        },
        {
            question: "Does a quote replace a consulting agreement?",
            answer: "For a small job it may be enough, but larger work calls for a proper contract covering confidentiality and liability. Have the quote refer to that agreement by name, and take legal advice on what it should say.",
        },
        {
            question: "Can I promise the client a saving or a growth figure?",
            answer: "Be very careful. Quote what you'll do, such as find the three largest costs and show options. A promised result depends on people you don't manage, and it could be held against you if the market turns.",
        },
        {
            question:
                "Their procurement team wants three competing quotes. What should I do?",
            answer: "Ask for their format and deadline, and whether they score on price alone. Keep your stages easy to compare. Your sponsor may be able to explain what you offer that others don't, so tell them as well.",
        },
    ],
};
