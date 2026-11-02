import type { TradeData } from "../types";

export const graphicDesigner: TradeData = {
    reviewed: false,
    lede: "Made for design work: concepts, rounds of changes, final artwork, print set-up and the rights a client gets when the bill is paid.",
    items: [
        {
            line: "Logo design",
            billedBy: "A fixed fee per project",
            description: "Logo design, 3 concepts",
            qty: "1",
            rate: "800",
        },
        {
            line: "Brand guide",
            billedBy: "A fixed fee",
            description: "Brand guide, 12 pages",
            qty: "1",
            rate: "500",
        },
        {
            line: "Layouts",
            billedBy: "Per page or per screen",
            description: "Brochure layout, per page",
            qty: "8",
            rate: "60",
        },
        {
            line: "Extra rounds",
            billedBy: "Per round, past those included",
            description: "Extra round of changes",
            qty: "1",
            rate: "100",
        },
        {
            line: "Studio time",
            billedBy: "Per hour",
            description: "Design time, hours",
            qty: "4",
            rate: "50",
        },
        {
            line: "Stock and fonts",
            billedBy: "At cost, per licence",
            description: "Stock image licence",
            qty: "2",
            rate: "20",
        },
    ],
    payment: {
        text: "Design projects are often split into a start fee and a balance before the final files go out. Hold the source files until the last payment clears, and say so at the start.",
        points: [
            "Part payment before the first concepts",
            "Balance due before final files are sent",
            "Retainer clients billed at the start of each month",
        ],
    },
    fields: [
        {
            name: "Project name",
            why: "A client with several jobs running needs to know which one this bill belongs to.",
        },
        {
            name: "Rounds used",
            why: "Showing rounds used against rounds included explains any charge for extra changes.",
        },
        {
            name: "Rights transfer",
            why: "One line on when ownership of the artwork passes to the client, and what it covers.",
        },
    ],
    example: {
        from: {
            name: "Your Design Studio",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Project", value: "Spring rebrand" },
            { label: "Rounds used", value: "2 of 2" },
        ],
        note: "Rights to the final artwork pass to the client once this bill is paid in full.",
    },
};
