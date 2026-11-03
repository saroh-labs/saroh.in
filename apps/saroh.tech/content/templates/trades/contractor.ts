import type { TradeData } from "../types";

export const contractor: TradeData = {
    reviewed: false,
    lede: "Made for building jobs: crew days, materials, subcontractors, waste and agreed changes, set against the stage of the work. Pick the document you need.",
    items: [
        {
            line: "Crew labour",
            billedBy: "Per person, per day",
            description: "Crew labour, person days",
            qty: "12",
            rate: "200",
        },
        {
            line: "Materials",
            billedBy: "At cost, or per load",
            description: "Timber, plasterboard and fixings",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Subcontractor",
            billedBy: "As quoted by the trade",
            description: "Roofer, subcontract price",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Site setup",
            billedBy: "A flat fee per job",
            description: "Site setup and protection",
            qty: "1",
            rate: "400",
        },
        {
            line: "Waste removal",
            billedBy: "Per skip or dumpster",
            description: "Skip hire and tipping",
            qty: "2",
            rate: "300",
        },
        {
            line: "Variations",
            billedBy: "Per agreed change",
            description: "Variation 1, extra window opening",
            qty: "1",
            rate: "650",
        },
    ],
    payment: {
        text: "Building work runs for weeks, so money tends to follow the stages: a sum to start, payments as each part finishes, and a last amount when the snag list is cleared.",
        points: [
            "A first payment before materials are ordered",
            "Stage payments tied to finished work",
            "A final sum once the snag list is done",
        ],
    },
    fields: [
        {
            name: "Site address",
            why: "The site is rarely the owner's billing address, and it's how a project is known on your books.",
        },
        {
            name: "Stage of work",
            why: "Naming the stage shows what this payment covers and what's still to come.",
        },
        {
            name: "Variation number",
            why: "A number on each agreed change links the extra cost back to the moment the client said yes.",
        },
    ],
    example: {
        from: {
            name: "Your Building Co",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name", address: "Billing address" },
        facts: [
            { label: "Site", value: "12 Quarry Lane, rear extension" },
            { label: "Stage", value: "Stage 2, walls and roof" },
        ],
        note: "Materials stay the property of the builder until paid for in full.",
    },
};
