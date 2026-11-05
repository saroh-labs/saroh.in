import type { Combo } from "../types";

export const estimateConsultant: Combo = {
    document: "estimate",
    trade: "consultant",
    reviewed: false,
    lede: "For engagements whose size depends on what you find: interviews still to run, data still to see. Budget in days, with a checkpoint where the client can stop.",
    items: [
        {
            line: "Discovery",
            billedBy: "Days, as a best guess",
            description: "Discovery phase, days",
            qty: "3",
            rate: "800",
        },
        {
            line: "Staff interviews",
            billedBy: "Per interview",
            description: "Interviews, about 10 people",
            qty: "10",
            rate: "100",
        },
        {
            line: "Data review",
            billedBy: "Days, depends on the data",
            description: "Review of sales data, days",
            qty: "2",
            rate: "800",
        },
        {
            line: "Findings session",
            billedBy: "Per session",
            description: "Findings session with leaders",
            qty: "1",
            rate: "600",
        },
        {
            line: "Follow-up days",
            billedBy: "Days, if needed",
            description: "Follow-up days, likely",
            qty: "4",
            rate: "800",
        },
        {
            line: "Expense allowance",
            billedBy: "An allowance, then actual cost",
            description: "Travel allowance",
            qty: "1",
            rate: "500",
        },
    ],
    payment: {
        text: "An estimate asks for no money. It helps a sponsor get a budget approved, and raises a purchase order for the likely figure. Bill real days as they happen, and warn them before that limit.",
        points: [
            "Nothing due until the purchase order is raised",
            "Real days billed monthly in arrears",
            "A checkpoint before any further phase begins",
        ],
    },
    fields: [
        {
            name: "Budget limit",
            why: "A purchase order often caps spend, so say you'll stop and ask before passing it.",
        },
        {
            name: "Checkpoint date",
            why: "A named date where the client can stop, change or carry on makes an open-ended job easier to approve.",
        },
        {
            name: "What you need from them",
            why: "Access to people and data is what most often stretches a piece of advice work.",
        },
    ],
    example: {
        number: "EST-0531",
        facts: [
            { label: "Engagement", value: "Sales review" },
            { label: "Checkpoint", value: "After 5 days" },
        ],
        note: "Follow-up days are booked only after the checkpoint.",
        termsText:
            "This is an estimate, not a fixed price. Real days are billed monthly. We will check with you at the checkpoint, and before going past this total.",
    },
    tips: [
        {
            title: "Add a checkpoint the client can use",
            text: "Finish the discovery phase, share what you found, then let them decide on the rest. A sponsor can approve a small first step far more readily than an open-ended engagement.",
        },
        {
            title: "Write what you'll need from staff",
            text: "Interviews that keep getting cancelled will stretch your days. Note how many people you need, how long for, and by when, so the delay is clearly not your doing.",
        },
        {
            title: "Separate days from outcomes",
            text: "An estimate should say what you'll look at, never what you'll deliver in revenue. You can't promise a result in a business you don't run, and a figure invites a dispute.",
        },
    ],
    faqs: [
        {
            question:
                "Will a finance team accept an estimate for a purchase order?",
            answer: "Often, if it shows a clear upper figure and a period. Ask your sponsor what their process needs. Some teams want a formal statement of work too, and some will raise the order against this page alone.",
        },
        {
            question:
                "How do I estimate when the client doesn't know the problem yet?",
            answer: "Estimate only the first phase, firmly, and leave the rest as a rough range. You can say the first few days exist to define the problem. A clear first step is more honest than a big number.",
        },
        {
            question: "Should I give a low and a high figure?",
            answer: "Yes, if the width means something. Say what causes each end, such as ten interviews versus thirty. Sponsors tend to budget for the higher number and feel good when you land lower, so don't be shy about showing it.",
        },
        {
            question: "What if the scope grows after the first interviews?",
            answer: "Bring it to the checkpoint rather than quietly working more days. Write down the new question, what it adds, and the revised figure. Then the sponsor can get more budget, or tell you to leave it out.",
        },
    ],
};
