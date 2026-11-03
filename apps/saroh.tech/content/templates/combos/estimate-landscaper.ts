import type { Combo } from "../types";

export const estimateLandscaper: Combo = {
    document: "estimate",
    trade: "landscaper",
    reviewed: false,
    lede: "Give a rough cost for a garden from a first walk round, before the levels are checked, the soil is dug or the planting plan is chosen.",
    example: {
        number: "EST-0533",
        issued: "2026-03-16",
        due: "2026-04-16",
        terms: "custom",
        facts: [
            { label: "Garden", value: "33 Ashfield Close" },
            { label: "Rough area", value: "About 85 square metres, paced" },
        ],
        termsText:
            "Rough cost from a walk round. Areas were paced, not surveyed. Ground conditions, access and the plants finally chosen can all change this figure.",
        note: "",
    },
    tips: [
        {
            title: "Say the area was paced, not measured",
            text: "A rough walk can be a long way out on a curved garden. Saying so means a bigger number after your proper survey reads as accuracy, and not as a price rise.",
        },
        {
            title: "Flag side access early",
            text: "With no way in for a mini digger, soil gets moved by barrow, and a day's dig can stretch into several. Mention the width of the gate you saw when you estimate.",
        },
        {
            title: "Offer planting as a range",
            text: "Young plants and mature specimens differ widely in cost, though they fill the same bed. Giving two figures lets a client choose between patience and an instant garden.",
        },
    ],
    faqs: [
        {
            question:
                "How do I estimate when I don't know what's under the lawn?",
            answer: "Allow a provisional sum for digging out and say what triggers it, such as buried rubble or roots. Clay and old concrete can double the waste loads, so warn the client before anyone starts lifting turf.",
        },
        {
            question: "Should a garden design fee be part of this figure?",
            answer: "List it apart. Someone may want your drawings and build it in stages, or hire another crew. A separate design line also shows they're paying for planning and not just for the labour outdoors.",
        },
        {
            question: "Can I split a big garden into phases?",
            answer: "Yes, and it often wins the job. Estimate the patio this spring and the planting next autumn as separate groups, then warn that the later figures may move, since prices and the ground can both change.",
        },
        {
            question:
                "When should I change a rough garden figure into a quote?",
            answer: "After you've measured properly, checked levels and drains, and the client has picked materials. Then issue a fixed price naming the stone and plant sizes, so nothing about the finished garden is left to memory.",
        },
    ],
    band: {
        title: "A rough figure for a real garden.",
        line: "Send it after the first walk round, then firm it up once levels are taken. 0% fees.",
    },
};
