import type { Combo } from "../types";

export const quoteLandscaper: Combo = {
    document: "quote",
    trade: "landscaper",
    reviewed: false,
    lede: "Fix a price for a measured garden: the named stone, plant sizes, soil and waste, with what's owed up front for materials and when work can begin.",
    example: {
        number: "Q-0533",
        issued: "2026-04-06",
        due: "2026-04-27",
        terms: "custom",
        depositPlan: "30",
        facts: [
            { label: "Garden", value: "33 Ashfield Close" },
            { label: "Work starts", value: "Early May, weather allowing" },
        ],
        termsText:
            "Fixed price for the measured areas and named materials. Start date depends on the weather. Buried services or rubble found while digging are priced before we go on.",
        note: "",
    },
    tips: [
        {
            title: "Name the stone, not just paving",
            text: "Sandstone in one grade may look nothing like the brochure in another. Print the product and its colour, and ask the client to approve a sample before you place the order.",
        },
        {
            title: "State plant sizes",
            text: "A small pot and a large one are the same shrub on paper. Writing the pot size or height stops a client expecting a tall screen on the day you plant whips.",
        },
        {
            title: "Keep weather out of your promise",
            text: "Waterlogged ground can't be laid on. Promise a start window, not a date, and say that wet spells move the schedule without changing the price of the agreed work.",
        },
    ],
    faqs: [
        {
            question: "What should a garden quote say about drains and cables?",
            answer: "Ask the owner to mark what they know, and state that unknown pipes found by your digger are priced as extra work. It also protects you if nobody ever told you about an old buried cable.",
        },
        {
            question: "Should I include looking after the garden afterwards?",
            answer: "Offer it as a separate choice. A price for the first season of feeding and mowing is easy to accept, and it protects your work, since neglected turf often gets blamed on whoever laid it.",
        },
        {
            question: "Does my price hold if planting moves to autumn?",
            answer: "Only if your quote says so. Nurseries change stock through the year, so give the date the plant list expires, and mention that a like-for-like swap may be needed when something is out of season.",
        },
        {
            question: "How do I quote for soil I may have to bring in?",
            answer: "Work out the volume from depth and area, then show it in tonnes as a line. Say that any extra needed once levels are set gets charged at the same per-tonne rate, already agreed here.",
        },
    ],
    band: {
        title: "Measured, named, agreed.",
        line: "Send the quote with its photos of the stone, and take the payment for materials through your own link. 0% fees.",
    },
};
