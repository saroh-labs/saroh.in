import type { Combo } from "../types";

export const estimatePhotographer: Combo = {
    document: "estimate",
    trade: "photographer",
    reviewed: false,
    lede: "For shoots that aren't pinned down yet: a brand shoot with a growing shot list, or an event with no final schedule. Show a likely cost and what could change it.",
    items: [
        {
            line: "Shoot days",
            billedBy: "Half day or full day, best guess",
            description: "Brand shoot, likely 2 days",
            qty: "2",
            rate: "1000",
        },
        {
            line: "Location scout",
            billedBy: "Per visit",
            description: "Location scouting visit",
            qty: "1",
            rate: "150",
        },
        {
            line: "Assistant",
            billedBy: "Per day",
            description: "Lighting assistant, days",
            qty: "2",
            rate: "200",
        },
        {
            line: "Studio or kit hire",
            billedBy: "An allowance, then actual cost",
            description: "Studio and lighting hire, allowance",
            qty: "1",
            rate: "500",
        },
        {
            line: "Retouching",
            billedBy: "Per image, count not final",
            description: "Retouched images, about 40",
            qty: "40",
            rate: "10",
        },
        {
            line: "Usage licence",
            billedBy: "Depends on where and how long",
            description: "Web and social use, 1 year",
            qty: "1",
            rate: "400",
        },
    ],
    payment: {
        text: "Nothing is owed on the estimate itself, and the date isn't held by it either. Once the shot list is settled, send a fixed quote and take a deposit then.",
        points: [
            "No payment, and no date held, at this stage",
            "A deposit once a fixed quote is accepted",
            "Hire and retouching billed by what was really used",
        ],
    },
    fields: [
        {
            name: "Shot list so far",
            why: "The number of looks or set-ups drives the days, so write the count you assumed.",
        },
        {
            name: "Usage needed",
            why: "A local website and a national advert are very different things to license.",
        },
        {
            name: "Date not held",
            why: "Say plainly that the date stays free for others until a deposit is paid.",
        },
    ],
    example: {
        number: "EST-0104",
        facts: [
            { label: "Likely dates", value: "Sep, 2 days" },
            { label: "Assumes", value: "6 looks, 2 locations" },
        ],
        note: "This estimate doesn't hold a date. Image rights are set in the final quote.",
        termsText:
            "This is an estimate, not a fixed price. It assumes 6 looks and 2 locations. If the shot list grows, we will send a new figure before the shoot.",
    },
    tips: [
        {
            title: "Say the date isn't held",
            text: "A client who has your figure may assume you're theirs. A plain line that the day stays open until a deposit arrives prevents a hard phone call later on.",
        },
        {
            title: "Base the days on looks",
            text: "Write how many looks or set-ups you allowed per day. When a marketing team adds another product line, the extra day needs no argument, because they can count it themselves.",
        },
        {
            title: "Separate the shoot from the licence",
            text: "The fee for the day and the right to run the pictures aren't the same thing. Showing them apart lets a brand widen its use later, without reopening the whole figure.",
        },
    ],
    faqs: [
        {
            question:
                "How can I estimate retouching before I've seen the images?",
            answer: "Allow a count and a level. Clean-up on forty product shots differs from heavy work on five hero images. Write both assumptions down, then bill the real number, and show a sample retouch if they aren't sure what they need.",
        },
        {
            question:
                "When should a brand shoot get an estimate rather than a package?",
            answer: "When the shot list, models or locations are still being decided. Packages suit a wedding or portrait with known hours. A marketing team's list often changes three times before the day, and an estimate leaves room for that.",
        },
        {
            question: "What if bad weather pushes an outdoor shoot back?",
            answer: "Add a sentence about what a weather delay does to the figure, including any non-refundable hire. Say who decides to postpone, and by what time. The extra costs are far easier to accept when they were named early.",
        },
        {
            question: "Do I need to estimate models and hair and makeup?",
            answer: "If you're organising them, yes. Show each as an allowance, marked as the other person's fee, and bill the real amount. If the client is booking them, say so, so your figure doesn't seem to include them.",
        },
    ],
};
