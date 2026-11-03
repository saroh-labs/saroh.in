import type { TradeData } from "../types";

export const eventPlanner: TradeData = {
    reviewed: false,
    lede: "Built for events: your planning fee, on-the-day coordination, staff hours and supplier costs kept apart from your own work. Pick the document you need.",
    items: [
        {
            line: "Planning fee",
            billedBy: "Flat fee per event",
            description: "Full planning fee",
            qty: "1",
            rate: "2000",
        },
        {
            line: "On-the-day coordination",
            billedBy: "Per day",
            description: "Coordination on the event day",
            qty: "1",
            rate: "800",
        },
        {
            line: "Venue search",
            billedBy: "Per hour",
            description: "Venue search and visits, hours",
            qty: "10",
            rate: "50",
        },
        {
            line: "Event staff",
            billedBy: "Per person, per hour",
            description: "Assistant on site, hours",
            qty: "12",
            rate: "25",
        },
        {
            line: "Supplier cost",
            billedBy: "At cost, or cost plus your fee",
            description: "Florist, passed on at cost",
            qty: "1",
            rate: "1200",
        },
        {
            line: "Hire items",
            billedBy: "Per item",
            description: "Chair hire, chairs",
            qty: "100",
            rate: "5",
        },
    ],
    payment: {
        text: "Events run for months and suppliers want paying before the day, so planners tend to bill in stages. Tie each stage to a date, and say who pays each supplier.",
        points: [
            "Booking fee when the agreement is signed",
            "Stage payments before suppliers fall due",
            "Final balance and any added costs after the event",
        ],
    },
    fields: [
        {
            name: "Event date and venue",
            why: "Clients with several events, and finance teams, file your bill under these.",
        },
        {
            name: "Guest count",
            why: "Catering, hire and staff lines all depend on it, so write the number you priced.",
        },
        {
            name: "Who pays each supplier",
            why: "It shows whether a cost runs through you or goes straight to the supplier.",
        },
    ],
    example: {
        from: {
            name: "Your Events Name",
            email: "plan@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Event date", value: "14 Mar" },
            { label: "Venue", value: "Venue name" },
            { label: "Guests", value: "100" },
        ],
        note: "Supplier costs are passed on as billed. Receipts on request.",
    },
};
