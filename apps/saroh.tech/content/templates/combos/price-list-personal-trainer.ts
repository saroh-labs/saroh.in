import type { Combo } from "../types";

export const priceListPersonalTrainer: Combo = {
    document: "price-list",
    trade: "personal-trainer",
    reviewed: false,
    lede: "One page to send when someone messages from the gym floor: single sessions, packs, online plans and small groups, each with what it includes and how long it lasts.",
    items: [
        {
            line: "Single session",
            billedBy: "Per hour",
            description: "One-to-one, 1 hour",
            qty: "1",
            rate: "60",
        },
        {
            line: "Short session",
            billedBy: "Per 30 minutes",
            description: "One-to-one, 30 minutes",
            qty: "1",
            rate: "35",
        },
        {
            line: "Pack of 10",
            billedBy: "Per pack, use within 3 months",
            description: "10 sessions, use within 3 months",
            qty: "1",
            rate: "500",
        },
        {
            line: "Small group",
            billedBy: "Per person, per class",
            description: "Small group, up to 4 people",
            qty: "1",
            rate: "20",
        },
        {
            line: "Online coaching",
            billedBy: "Per month",
            description: "Plan and weekly check-in",
            qty: "1",
            rate: "100",
        },
        {
            line: "Programme only",
            billedBy: "Per programme",
            description: "12-week written programme",
            qty: "1",
            rate: "150",
        },
    ],
    fields: [
        {
            name: "Session length",
            why: "An hour and thirty minutes draw very differently on your diary, so state each one.",
        },
        {
            name: "Where you train",
            why: "Your gym, their home or a park can change the price, and it's the first thing they ask.",
        },
        {
            name: "How long a pack lasts",
            why: "A pack without a time limit is a debt you carry forever.",
        },
    ],
    example: {
        number: "2026 price list",
        issued: "2026-01-05",
        client: { name: "" },
        facts: [
            { label: "Sessions at", value: "Gym name, or your home" },
            { label: "Free intro call", value: "15 minutes" },
        ],
        note: "Prices don't include gym entry. Packs are paid before the first session.",
    },
    tips: [
        {
            title: "Lead with the option you want sold",
            text: "If packs suit your diary best, put them first and let the single session sit below. A client who compares the two can do the sums on the spot.",
        },
        {
            title: "Say who the small group suits",
            text: "A line that says beginners, or new mothers, or runners helps the right person pick it. It also stops someone expecting one-to-one attention in a class of four.",
        },
        {
            title: "Show the home-visit cost plainly",
            text: "If going to someone's house costs more, say so on this page. Better they see it now than feel caught out when the first bill has a travel line.",
        },
    ],
    faqs: [
        {
            question:
                "Should a trainer's prices be public, or sent only on request?",
            answer: "It depends on how you win clients. A public list filters out people who would never pay it. Holding it back gets you a conversation first. Try one for a few months and count the bookings that follow.",
        },
        {
            question:
                "How do I price a shorter session without undercutting my hour?",
            answer: "Set the half-hour above half your hourly rate, since it still takes a full slot in a busy diary, along with the set-up. Then a shorter session is a real choice, and not simply a cheaper hour.",
        },
        {
            question: "Can I keep old clients on an older rate?",
            answer: "Yes. Date this list, and tell existing clients in person when their rate will move. Some coaches keep a rate until a pack runs out. Whichever you choose, say it plainly, so nobody finds out from a stranger's copy.",
        },
    ],
    band: {
        title: "Every way to train with you, on one page.",
        line: "Send it from your phone, then take the booking and the payment through your own link. 0% fees.",
    },
};
