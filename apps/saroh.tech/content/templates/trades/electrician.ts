import type { TradeData } from "../types";

export const electrician: TradeData = {
    reviewed: false,
    lede: "Made for electrical work: points fitted, metres of cable, hours on site, the board upgrade and the testing that proves it's safe. Pick the document you need.",
    items: [
        {
            line: "Site visit",
            billedBy: "A flat fee per visit",
            description: "Site visit and fault finding",
            qty: "1",
            rate: "60",
        },
        {
            line: "Labour",
            billedBy: "Per hour, per electrician",
            description: "Electrician, hours on site",
            qty: "6",
            rate: "50",
        },
        {
            line: "Points",
            billedBy: "Per socket, switch or light",
            description: "New double sockets, fitted",
            qty: "8",
            rate: "45",
        },
        {
            line: "Cable",
            billedBy: "Per metre or foot",
            description: "Twin and earth cable, metres",
            qty: "40",
            rate: "2",
        },
        {
            line: "Fuse board",
            billedBy: "Per unit, fitted",
            description: "New fuse board, 12 way",
            qty: "1",
            rate: "350",
        },
        {
            line: "Testing",
            billedBy: "A flat fee per circuit or job",
            description: "Testing and written test report",
            qty: "1",
            rate: "120",
        },
    ],
    payment: {
        text: "A fault repair is often settled the same day. A rewire is different: cable and boards are bought early, so a first payment helps, and the rest falls due after testing.",
        points: [
            "Same-day payment for a fault repair",
            "A first payment before a rewire starts",
            "The balance once testing is finished",
        ],
    },
    fields: [
        {
            name: "Circuits worked on",
            why: "Naming them ties the bill to the test report and helps the next electrician who opens the board.",
        },
        {
            name: "Test report number",
            why: "The owner will look for it when selling the home or answering an insurer.",
        },
        {
            name: "Property address",
            why: "Rented homes and offices are often paid for by someone who has never been there.",
        },
    ],
    example: {
        from: {
            name: "Your Electrical Co",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Client name", address: "Billing address" },
        facts: [
            { label: "Property", value: "6 Mill Street" },
            { label: "Test report", value: "TR-0412" },
        ],
        note: "Keep this document with your test report.",
    },
};
