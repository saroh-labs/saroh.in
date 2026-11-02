import type { Combo } from "../types";

export const estimateMakeupArtist: Combo = {
    document: "estimate",
    trade: "makeup-artist",
    reviewed: false,
    lede: "When the party size and the venue aren't settled yet, send a likely figure with the headcount you assumed, so the couple can plan and you stay free to adjust.",
    items: [
        {
            line: "Bride",
            billedBy: "Per person",
            description: "Bride's makeup and touch-up kit",
            qty: "1",
            rate: "300",
        },
        {
            line: "Likely party",
            billedBy: "Per person, number not final",
            description: "Party makeup, likely 4 to 6 people",
            qty: "5",
            rate: "80",
        },
        {
            line: "Second artist",
            billedBy: "Per day, only above 6 people",
            description: "Second artist, if the party grows",
            qty: "1",
            rate: "250",
        },
        {
            line: "Stay-on touch-ups",
            billedBy: "Per hour",
            description: "Touch-ups through the ceremony, hours",
            qty: "2",
            rate: "50",
        },
        {
            line: "Likely travel",
            billedBy: "Flat fee, venue not final",
            description: "Travel, depends on venue",
            qty: "1",
            rate: "60",
        },
        {
            line: "Overnight stay",
            billedBy: "Per night, only if needed",
            description: "Hotel, if start is before 6 am",
            qty: "1",
            rate: "100",
        },
    ],
    example: {
        number: "EST-0001",
        issued: "2026-01-12",
        due: "2026-02-12",
        facts: [
            { label: "Wedding date", value: "14 Mar" },
            { label: "Party assumed", value: "6 people" },
        ],
        termsText:
            "This is an estimate until the headcount and venue are confirmed. The date isn't held until a retainer is paid.",
    },
    tips: [
        {
            title: "Say the date isn't held yet",
            text: "Couples often think an estimate means you are booked. Tell them plainly that the date stays open to others until they pay the retainer, and how long you can wait.",
        },
        {
            title: "Show when a second artist comes in",
            text: "One person can only finish so many faces before the ready-by time. Write the number where you'd need help, so a growing party doesn't quietly double your morning.",
        },
        {
            title: "Leave the ready-by time as a question",
            text: "Ceremony times move while couples are planning. Ask for the time they must be finished, and warn them a change could add an early-start charge to this figure.",
        },
    ],
    faqs: [
        {
            question: "How do I estimate when the bride hasn't picked a look?",
            answer: "Price the time rather than the look, and name your assumption, such as a soft day look in about 90 minutes. Heavier work, airbrush or added lashes can go on separate lines marked as possible extras.",
        },
        {
            question:
                "The venue is still being chosen. What travel figure do I give?",
            answer: "Pick one sensible area and state it, for example within 30 miles. Then say what a further venue would add, per mile. They can check each venue they visit against that one simple rule.",
        },
        {
            question: "Can I give a rough figure by message instead?",
            answer: "You can, but a message gets lost and details blur. A short written estimate records the headcount and date you assumed, so when the party grows by three there's a clear reason the number moved.",
        },
    ],
    band: {
        title: "A wedding figure they can plan around.",
        line: "Send the estimate, then turn it into a booking with a retainer once the date is theirs. 0% fees.",
    },
};
