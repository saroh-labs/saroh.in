import type { Combo } from "../types";

export const receiptLandscaper: Combo = {
    document: "receipt",
    trade: "landscaper",
    reviewed: false,
    lede: "Confirm money for a garden job or a month of visits: which garden, which dates and how it was paid, whether by cash at the gate or transfer.",
    items: [
        {
            line: "Lawn mowing",
            billedBy: "Per visit",
            description: "Lawn mowing and edging, visits",
            qty: "4",
            rate: "30",
        },
        {
            line: "Hedge cutting",
            billedBy: "Per cut",
            description: "Front hedge, cut and tidied",
            qty: "1",
            rate: "60",
        },
        {
            line: "Weeding",
            billedBy: "Per hour",
            description: "Weeding borders, hours",
            qty: "3",
            rate: "20",
        },
        {
            line: "Bedding plants",
            billedBy: "Per tray",
            description: "Summer bedding plants, trays",
            qty: "2",
            rate: "15",
        },
        {
            line: "Feed and moss treatment",
            billedBy: "Per treatment",
            description: "Lawn feed and moss treatment",
            qty: "1",
            rate: "40",
        },
        {
            line: "Green waste",
            billedBy: "Per bag or load",
            description: "Clippings taken away, bags",
            qty: "6",
            rate: "5",
        },
    ],
    example: {
        number: "RCT-0533",
        issued: "2026-06-30",
        due: "",
        terms: "custom",
        facts: [
            { label: "Paid on", value: "30 Jun 2026" },
            { label: "Paid by", value: "Cash" },
            { label: "Visits", value: "4, 11, 18 and 25 Jun" },
        ],
        note: "Thank you. This covers June's garden visits in full.",
    },
    tips: [
        {
            title: "List visit dates on monthly slips",
            text: "Older clients often pay for mowing at the door, then forget which weeks that covered. Printing the dates means nobody pays twice, or wonders whether a rainy Tuesday counted.",
        },
        {
            title: "Name the garden for landlords",
            text: "Someone with several rental homes needs to split each cost by property. The address on this slip makes your payment easy for them to claim against the right house.",
        },
        {
            title: "Log cash before the next garden",
            text: "A round of cash gardens blurs together by evening. Send each slip before you drive on, and your takings for the day will match your records without guesswork.",
        },
    ],
    faqs: [
        {
            question: "Should a regular customer get one slip per mow?",
            answer: "They can, but one each month reads better for most homes. Group the visits and print the dates. Anyone who pays weekly, or wants proof for a landlord, can still have one each time.",
        },
        {
            question:
                "A neighbour paid for the shared hedge. Whose name goes on it?",
            answer: "The person who handed you the money. If two households each paid half, write two slips, each naming that household's share and the hedge. Then neither has to chase the other for proof afterwards.",
        },
        {
            question: "Can I issue one for plants bought on a client's behalf?",
            answer: "Yes. Describe the plants and say that you bought them for this garden, and keep the nursery's own slip. If the shrub later fails, it shows who paid and where it came from.",
        },
    ],
};
