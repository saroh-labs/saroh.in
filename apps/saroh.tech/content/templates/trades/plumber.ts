import type { TradeData } from "../types";

export const plumber: TradeData = {
    reviewed: false,
    lede: "Made for plumbing jobs: call-outs, labour by the hour, parts used and the job address, so a client can see just what they're paying for.",
    items: [
        {
            line: "Call-out",
            billedBy: "A flat fee per visit",
            description: "Call-out, weekday",
            qty: "1",
            rate: "70",
        },
        {
            line: "Labour",
            billedBy: "Per hour",
            description: "Labour, hours on site",
            qty: "3",
            rate: "60",
        },
        {
            line: "Parts",
            billedBy: "Per part, as used",
            description: "Mixer tap, chrome",
            qty: "1",
            rate: "85",
        },
        {
            line: "Small parts",
            billedBy: "Per pack, or a set amount",
            description: "Valves, pipe and fittings",
            qty: "1",
            rate: "30",
        },
        {
            line: "Emergency work",
            billedBy: "Extra per hour, out of hours",
            description: "Out-of-hours extra, hours",
            qty: "2",
            rate: "40",
        },
        {
            line: "Disposal",
            billedBy: "A flat fee",
            description: "Old boiler parts, disposal",
            qty: "1",
            rate: "25",
        },
    ],
    payment: {
        text: "Small repairs are mostly paid when the job is done, often on the doorstep. Bigger work, such as a new bathroom, is usually split into a deposit for parts and a balance at the finish.",
        points: [
            "Pay on completion for a call-out or small repair",
            "A deposit to cover parts on a bigger job",
            "Stage payments on a bathroom or a boiler fit",
        ],
    },
    fields: [
        {
            name: "Job address",
            why: "It's often not the billing address, especially when a landlord or agent is paying.",
        },
        {
            name: "Parts used",
            why: "Listing each part shows the client what they paid for and supports any warranty later.",
        },
        {
            name: "Date and time on site",
            why: "These explain the hours billed and any out-of-hours rate.",
        },
    ],
    example: {
        from: {
            name: "Your Plumbing Co",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name", address: "Billing address" },
        facts: [
            { label: "Job address", value: "27 Larch Road" },
            { label: "On site", value: "14 Mar, 8:00 pm" },
        ],
        note: "Parts carry the maker's warranty. Keep this invoice as proof of purchase.",
    },
};
