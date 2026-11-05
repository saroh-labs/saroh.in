import type { Combo } from "../types";

export const quoteMakeupArtist: Combo = {
    document: "quote",
    trade: "makeup-artist",
    reviewed: false,
    lede: "A fixed price for the whole wedding morning: who you'll make up, the ready-by time, the retainer to hold the date and what cancelling costs.",
    example: {
        number: "Q-0001",
        issued: "2026-01-19",
        due: "2026-02-02",
        depositPlan: "30",
        termsText:
            "A 30% retainer holds the date and isn't refundable. The balance is due 7 days before the event. Added people are charged at the rate above.",
    },
    tips: [
        {
            title: "Write down the order of faces",
            text: "Say the bride is finished last, or by when. A short running order shows you've done this before, and heads off a morning argument about who sits down first.",
        },
        {
            title: "List what the client must arrange",
            text: "Good light, a table, a chair and a plug near a window all change your work. Put them on the quote, so a dark hotel corridor isn't your problem on the day.",
        },
        {
            title: "Make the retainer rule one sentence",
            text: "Say what happens to it if they cancel or change the date. Keeping the rule short makes it likely to be read, and easy to point back to if plans shift.",
        },
    ],
    faqs: [
        {
            question:
                "What if the couple moves their wedding date after booking?",
            answer: "Say whether the retainer moves with them, as long as you are free on the new date, and what happens if you're not. Writing this before they pay spares you a painful talk later on.",
        },
        {
            question:
                "Should I quote the trial separately from the wedding day?",
            answer: "Separate lines work best, because a trial may lead to no booking at all. It also lets the client pay and try you first, then accept the rest of the quote with confidence.",
        },
        {
            question:
                "A bride asks for a named product or brand. Can I promise it?",
            answer: "Promise it only if you already carry it and it suits her skin. If she wants something special bought in, add it as its own line, and say the cost goes up if the price does.",
        },
        {
            question: "Do I need to mention allergies on a quote?",
            answer: "A plain line asking the client to tell you about allergies or sensitive skin before the trial is sensible. It protects them first. Ask every person in the party, not only the bride.",
        },
    ],
};
