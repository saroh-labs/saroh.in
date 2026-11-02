import type { TradeData } from "../types";

export const landscaper: TradeData = {
    reviewed: false,
    lede: "Made for garden work: square metres of paving and turf, plants by the piece, tonnes of soil, loads taken away and regular visits. Pick the document you need.",
    items: [
        {
            line: "Site clearance",
            billedBy: "Per day",
            description: "Clearing beds and old lawn, days",
            qty: "2",
            rate: "300",
        },
        {
            line: "Paving",
            billedBy: "Per square metre or foot",
            description: "Stone patio, laid, square metres",
            qty: "25",
            rate: "80",
        },
        {
            line: "Turf",
            billedBy: "Per square metre or foot",
            description: "New turf, laid, square metres",
            qty: "60",
            rate: "10",
        },
        {
            line: "Plants",
            billedBy: "Per plant or tree",
            description: "Hedging plants, supplied and planted",
            qty: "30",
            rate: "15",
        },
        {
            line: "Topsoil",
            billedBy: "Per tonne or cubic yard",
            description: "Screened topsoil, tonnes",
            qty: "4",
            rate: "50",
        },
        {
            line: "Green waste",
            billedBy: "Per load",
            description: "Green waste removal, loads",
            qty: "3",
            rate: "120",
        },
    ],
    payment: {
        text: "A new garden means stone and plants bought weeks ahead, so a first payment often covers them. Regular mowing or hedge visits suit a simple bill at the end of each month.",
        points: [
            "A first payment for stone and plants",
            "The balance when the build is finished",
            "A monthly bill for regular visits",
        ],
    },
    fields: [
        {
            name: "Garden address",
            why: "Tells a landlord or a managing agent which of their properties the work was at.",
        },
        {
            name: "Measured area",
            why: "Clients can check a square-metre price against their own tape measure.",
        },
        {
            name: "Plant care terms",
            why: "One line on watering says who looks after new planting once you've left.",
        },
    ],
    example: {
        from: {
            name: "Your Garden Co",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name", address: "Billing address" },
        facts: [
            { label: "Garden", value: "33 Ashfield Close" },
            { label: "Measured area", value: "85 square metres" },
        ],
        note: "New plants and turf need regular watering by the client after planting.",
    },
};
