import type { TradeData } from "../types";

export const salon: TradeData = {
    reviewed: false,
    lede: "Built for the chair: cuts, colour, treatments, nails, the products clients take home and who did the work. Pick the document you need.",
    items: [
        {
            line: "Cut and blow-dry",
            billedBy: "Per service",
            description: "Cut and blow-dry",
            qty: "1",
            rate: "50",
        },
        {
            line: "Colour",
            billedBy: "Per service, by hair length",
            description: "Full head colour, long hair",
            qty: "1",
            rate: "90",
        },
        {
            line: "Highlights",
            billedBy: "Half head or full head",
            description: "Half head highlights",
            qty: "1",
            rate: "80",
        },
        {
            line: "Treatment",
            billedBy: "Per treatment",
            description: "Conditioning treatment",
            qty: "1",
            rate: "25",
        },
        {
            line: "Nails",
            billedBy: "Per service",
            description: "Gel manicure",
            qty: "1",
            rate: "35",
        },
        {
            line: "Products",
            billedBy: "Per item",
            description: "Take-home shampoo, bottles",
            qty: "2",
            rate: "20",
        },
    ],
    payment: {
        text: "Most salon visits are paid at the desk, but long colour work and group bookings often need a deposit to protect the time. Say how much notice cancels without losing it.",
        points: [
            "Paid at the desk after the visit",
            "Deposit for long colour or group bookings",
            "Products rung up on their own lines",
        ],
    },
    fields: [
        {
            name: "Appointment date",
            why: "A client checking a card payment looks for the day of the visit first.",
        },
        {
            name: "Stylist",
            why: "Clients rebook by name, and your own records need it if you split takings.",
        },
        {
            name: "Patch test date",
            why: "If you test before colour, a dated line shows the check was done.",
        },
    ],
    example: {
        from: {
            name: "Your Salon Name",
            email: "desk@example.com",
            address: "Your address",
        },
        client: { name: "Client name" },
        facts: [
            { label: "Appointment", value: "14 Mar, 10:00 am" },
            { label: "Stylist", value: "Stylist name" },
        ],
        note: "Please give 24 hours' notice to move your appointment.",
    },
};
