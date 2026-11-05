import type { Combo } from "../types";

export const estimatePersonalTrainer: Combo = {
    document: "estimate",
    trade: "personal-trainer",
    reviewed: false,
    lede: "For the client who asks what getting ready for a race or a wedding will cost. Give a likely number of sessions and show that it can change.",
    items: [
        {
            line: "Starting assessment",
            billedBy: "Per assessment",
            description: "Movement and fitness assessment",
            qty: "1",
            rate: "40",
        },
        {
            line: "Coaching sessions, low",
            billedBy: "Per session, likely range",
            description: "Sessions, 2 a week for 8 weeks",
            qty: "16",
            rate: "60",
        },
        {
            line: "Extra sessions, if needed",
            billedBy: "Per session, only if agreed",
            description: "Possible extra sessions",
            qty: "4",
            rate: "60",
        },
        {
            line: "Goal programme",
            billedBy: "Per programme",
            description: "8-week race programme",
            qty: "1",
            rate: "150",
        },
        {
            line: "Progress review",
            billedBy: "Per review",
            description: "Progress review at week 4",
            qty: "1",
            rate: "30",
        },
        {
            line: "Studio hire",
            billedBy: "Per visit, if you can't train at home",
            description: "Studio hire, visits",
            qty: "16",
            rate: "10",
        },
    ],
    example: {
        number: "EST-0001",
        issued: "2026-02-02",
        due: "2026-03-02",
        facts: [
            { label: "Goal", value: "10 km race, 12 Apr" },
            { label: "Weeks", value: "8" },
        ],
        termsText:
            "This is an estimate of the sessions likely to be needed, not a promised result. We review at week 4 and agree any change before it's billed.",
    },
    tips: [
        {
            title: "Estimate the work, not the body",
            text: "Say how many sessions you expect to run. Don't promise a weight, a time or a size. Bodies differ, and an estimate that reads like a guarantee will come back to you.",
        },
        {
            title: "Name the week you'll review it",
            text: "A progress review gives you a set moment to say more sessions would help. The client hears it as planned care, not as a surprise request for money.",
        },
        {
            title: "Say what could raise the number",
            text: "An old injury, missed weeks or a move in the race date can all add hours. Name them now, so a later change points back to something you already wrote.",
        },
    ],
    faqs: [
        {
            question:
                "How can I estimate sessions before I've seen someone move?",
            answer: "Offer the assessment first, then send the estimate. If they want a figure right away, give a range with two lines, sessions at the low end and possible extras, and say the assessment may change it.",
        },
        {
            question:
                "Should an estimate for a beginner look different from one for a regular?",
            answer: "Often, yes. Someone new may need more supervised hours before training alone. A regular may only need a plan and a monthly check. Write the mix you actually expect, rather than sending both the same list.",
        },
        {
            question: "What if a doctor has told them to be careful?",
            answer: "Ask them to confirm they are cleared to train, and note that the plan depends on it. Add a line saying the session count may change on medical advice. You are pricing the coaching, not giving medical advice.",
        },
    ],
};
