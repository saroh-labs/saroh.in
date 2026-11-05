import type { Combo } from "../types";

export const estimateSalon: Combo = {
    document: "estimate",
    trade: "salon",
    reviewed: false,
    lede: "For colour correction and other long work where the real cost shows only once the hair is in your hands. Give a likely figure, and say what could change it.",
    items: [
        {
            line: "Consultation and strand test",
            billedBy: "Per test",
            description: "Consultation and strand test",
            qty: "1",
            rate: "20",
        },
        {
            line: "Colour correction time",
            billedBy: "Per hour, likely range",
            description: "Colour correction, likely 3 to 5 hours",
            qty: "4",
            rate: "60",
        },
        {
            line: "Bleach or lightener",
            billedBy: "Per bowl",
            description: "Lightener used, bowls",
            qty: "3",
            rate: "20",
        },
        {
            line: "Bond treatment",
            billedBy: "Per treatment",
            description: "Bond repair during service",
            qty: "1",
            rate: "30",
        },
        {
            line: "Toner",
            billedBy: "Per application",
            description: "Toner and gloss",
            qty: "2",
            rate: "25",
        },
        {
            line: "Second visit, if needed",
            billedBy: "Per visit, only if agreed",
            description: "Second sitting, if the hair needs rest",
            qty: "1",
            rate: "120",
        },
    ],
    example: {
        number: "EST-0001",
        issued: "2026-02-16",
        due: "2026-03-16",
        facts: [
            { label: "Hair history", value: "Box dye, 2 years" },
            { label: "Strand test", value: "16 Feb" },
        ],
        termsText:
            "This estimate is based on the strand test. Hair may react differently on the day, and we'll tell you before going above this figure.",
    },
    tips: [
        {
            title: "Ask about the hair's past first",
            text: "Box dye, henna and old bleach can all change the result. Write what the client told you on the estimate, so you and they share the same starting point.",
        },
        {
            title: "Price by the hour on long colour",
            text: "Fixed menu prices rarely fit a correction. An hourly line with a likely range gives you room, and shows why two heads of hair can cost differently.",
        },
        {
            title: "Warn that it may take two visits",
            text: "Hair may need to rest between lightening sessions. Showing the second sitting as a possibility makes it feel like care, instead of feeling like you've failed at the first.",
        },
    ],
    faqs: [
        {
            question:
                "Can I charge for a strand test if the client walks away?",
            answer: "Yes, if you told them first. Some salons take the fee off the work if they book. Say which on this page, and keep the test's result on file against their name for whoever does the colour.",
        },
        {
            question:
                "What do I write if the hair might not reach the colour they want?",
            answer: "Say so plainly: your target is a shade in that range, and the hair's condition may set the limit. Agreeing this before the first bowl is mixed will save you from a hard talk at the mirror.",
        },
        {
            question: "How much above an estimate is fair at the basin?",
            answer: "There's no set rule, so choose your own limit and write it down. Telling them before you pass it matters most. A quick word mid-service is better than a shock at the desk.",
        },
    ],
};
