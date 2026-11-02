import type { TradeData } from "../types";

export const makeupArtist: TradeData = {
    reviewed: false,
    lede: "Built for bookings: the bride's look, the trial, each person in the party, early starts, travel and the retainer that held the date. Pick the document you need.",
    items: [
        {
            line: "Bridal makeup",
            billedBy: "Per person",
            description: "Bridal makeup, wedding morning",
            qty: "1",
            rate: "300",
        },
        {
            line: "Makeup trial",
            billedBy: "Per trial",
            description: "Bridal trial, 2 hours",
            qty: "1",
            rate: "100",
        },
        {
            line: "Party makeup",
            billedBy: "Per person",
            description: "Bridesmaid and family makeup, people",
            qty: "4",
            rate: "80",
        },
        {
            line: "False lashes",
            billedBy: "Per set",
            description: "Strip lashes, sets",
            qty: "5",
            rate: "15",
        },
        {
            line: "Early start",
            billedBy: "Per hour before your start time",
            description: "Start before 7 am, hours",
            qty: "2",
            rate: "40",
        },
        {
            line: "Travel",
            billedBy: "Miles or km, or a flat fee",
            description: "Travel to venue, miles",
            qty: "40",
            rate: "0.50",
        },
    ],
    payment: {
        text: "A wedding date can only be sold once, so a retainer usually holds it, with the rest due before or on the morning. Put the retainer, the balance and its date in writing.",
        points: [
            "Retainer to hold the date",
            "Balance due before the first face on the day",
            "Added people billed at the same per-person rate",
        ],
    },
    fields: [
        {
            name: "Event date and ready-by time",
            why: "The time everyone must be finished sets your start, and any early-start charge.",
        },
        {
            name: "Number of people",
            why: "Your price and your time on the day both turn on this count.",
        },
        {
            name: "Getting-ready address",
            why: "It's often a hotel or a family home, not the venue, and it decides the travel line.",
        },
    ],
    example: {
        from: {
            name: "Your Artist Name",
            email: "bookings@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Event date", value: "14 Mar" },
            { label: "Ready by", value: "11:30 am" },
            { label: "People", value: "5" },
        ],
        note: "Please tell me of any skin allergies before the trial.",
    },
};
