import type { Combo } from "../types";

export const quotePersonalTrainer: Combo = {
    document: "quote",
    trade: "personal-trainer",
    reviewed: false,
    lede: "A fixed price for a set block of coaching: how many sessions, over how long, and what happens to the ones they don't use.",
    items: [
        {
            line: "Coaching block",
            billedBy: "Per block",
            description: "12-week block, 24 sessions",
            qty: "1",
            rate: "1200",
        },
        {
            line: "Starting assessment",
            billedBy: "Per assessment",
            description: "Assessment, with a written summary",
            qty: "1",
            rate: "40",
        },
        {
            line: "Written programme",
            billedBy: "Per programme",
            description: "Days between sessions, written plan",
            qty: "1",
            rate: "150",
        },
        {
            line: "App check-ins",
            billedBy: "Per month",
            description: "Weekly app check-ins, months",
            qty: "3",
            rate: "30",
        },
        {
            line: "Couples add-on",
            billedBy: "Per person, per block",
            description: "Partner joining the sessions",
            qty: "1",
            rate: "400",
        },
        {
            line: "Group session for staff",
            billedBy: "Per group session",
            description: "Staff group class, up to 10 people",
            qty: "2",
            rate: "120",
        },
    ],
    example: {
        number: "Q-0001",
        issued: "2026-01-05",
        due: "2026-01-19",
        depositPlan: "50",
        facts: [
            { label: "Block starts", value: "26 Jan" },
            { label: "Sessions a week", value: "2" },
        ],
        termsText:
            "Half is due to book the block and half at week 6. Sessions must be used within 16 weeks of the start date. Unused sessions don't carry over after that.",
    },
    tips: [
        {
            title: "Put an end date on the block",
            text: "Without one, a client can return a year later and claim six sessions at the old rate. Write the last date sessions can be used, and allow a little room for holidays.",
        },
        {
            title: "Say what pausing costs",
            text: "Illness and travel come up in any twelve weeks. Say how long a block can be paused for free, so a pause is a yes or no answer and not a negotiation.",
        },
        {
            title: "Offer one step up, not three",
            text: "Two clear options beat a menu. Show the block alone, then the same block with a written plan and check-ins, so the client compares what they get and not your rates.",
        },
    ],
    faqs: [
        {
            question: "Do I quote per session or for the whole block?",
            answer: "A block is easier to accept and to plan your diary around. If you'd rather keep a per-session rate on show, write it in the description, 24 sessions at the rate, then total it on one line.",
        },
        {
            question: "What do I write if they want to train with a partner?",
            answer: "Give the added person their own line, and say whether you need both there for each session. Also say what happens if one drops out, since the price for one person alone may differ.",
        },
        {
            question: "How long should my quote for a new client stay open?",
            answer: "Long enough to decide, short enough that your diary stays yours. Two weeks suits many trainers. Hold the time slots only once the deposit lands, and write that on the quote.",
        },
        {
            question: "Should I include a refund rule for unused sessions?",
            answer: "Yes, one sentence is enough. State whether unused sessions can be refunded, moved to someone else or simply expire on the end date. Check what your local consumer rules allow before you make it final.",
        },
    ],
};
