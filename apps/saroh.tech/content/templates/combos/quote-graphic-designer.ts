import type { Combo } from "../types";

export const quoteGraphicDesigner: Combo = {
    document: "quote",
    trade: "graphic-designer",
    reviewed: false,
    lede: "A fixed price for a clear design job: how many concepts, how many rounds, which files you hand over and what the client may do with them.",
    items: [
        {
            line: "Identity package",
            billedBy: "A fixed fee",
            description: "Logo, 3 concepts, 2 rounds",
            qty: "1",
            rate: "1200",
        },
        {
            line: "Business stationery",
            billedBy: "Per item designed",
            description: "Card, letterhead and envelope",
            qty: "3",
            rate: "80",
        },
        {
            line: "Social templates",
            billedBy: "Per template",
            description: "Social post templates",
            qty: "6",
            rate: "40",
        },
        {
            line: "Final file set",
            billedBy: "Included, per format",
            description: "PNG, SVG and PDF files",
            qty: "1",
            rate: "0",
        },
        {
            line: "Source files",
            billedBy: "A one-time fee",
            description: "Editable source files",
            qty: "1",
            rate: "200",
        },
        {
            line: "Full rights",
            billedBy: "A one-time fee",
            description: "Full rights to the final logo",
            qty: "1",
            rate: "300",
        },
    ],
    payment: {
        text: "State the start fee on the quote, so saying yes and paying the first part are the same step. Tie the rest to approved artwork, before final files are released.",
        points: [
            "A share of the price when the quote is accepted",
            "Balance when the artwork is approved",
            "Final files released after the last payment",
        ],
    },
    fields: [
        {
            name: "Rounds included",
            why: "A clear count turns the sixth tweak into a paid extra rather than an argument.",
        },
        {
            name: "Files delivered",
            why: "Name the formats. A client may assume editable files come with the price.",
        },
        {
            name: "Usage rights",
            why: "Say where the work may be used and when the rights pass over.",
        },
    ],
    example: {
        number: "Q-0312",
        facts: [
            { label: "Project", value: "New identity" },
            { label: "Rounds", value: "2 included" },
        ],
        note: "Rights to the final artwork pass on full payment.",
        termsText:
            "Price covers the concepts, rounds and files listed. Further rounds are billed per round, agreed first. Balance is due when the artwork is approved.",
    },
    tips: [
        {
            title: "Price rights as their own line",
            text: "When rights sit inside one big fee, a client never sees that they have value. A separate line opens a calm talk about what they need, and lets them choose.",
        },
        {
            title: "Define what a round means",
            text: "Say that one round is one set of combined comments. Without that sentence, five separate emails in a day can each feel like a free tweak to the person sending them.",
        },
        {
            title: "Say what happens when they go quiet",
            text: "Add a line that the project pauses after a set time with no reply, and may need a restart fee. Stalled jobs block your calendar for work that does pay.",
        },
    ],
    faqs: [
        {
            question: "Should I show the price of each concept?",
            answer: "Usually a single package price reads better, because concepts aren't things a client buys one at a time. Show the number included, then price an extra direction separately. That way they can't trim your thinking time to cut the total.",
        },
        {
            question: "What if the client wants a logo but no rights?",
            answer: "Then spell out a licence: where they can use it, and for how long. A business will usually want full ownership of its own logo, so it's worth explaining what they'd be missing before they pick the cheaper line.",
        },
        {
            question: "Can I quote for a monthly design retainer?",
            answer: "Yes. Set a number of hours or requests per month, say what happens to unused time, and name a notice period. Treat it as its own quote, rather than adding it beneath a one-off branding project.",
        },
        {
            question:
                "A client wants a free sample before accepting. What do I say?",
            answer: "Point to your past work rather than starting theirs. If they need to see their own brand first, offer a small paid first stage. That covers your time, and the fee can come off the full price if they carry on.",
        },
    ],
    band: {
        title: "Scope agreed. Pencils out.",
        line: "Your client accepts the quote online, pays the start fee through your own link, and you begin. 0% fees.",
    },
};
