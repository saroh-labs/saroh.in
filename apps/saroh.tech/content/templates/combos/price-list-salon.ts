import type { Combo } from "../types";

export const priceListSalon: Combo = {
    document: "price-list",
    trade: "salon",
    reviewed: false,
    lede: "Your menu of cuts, colour, nails and treatments, by hair length and stylist level, to put on the wall, on your website or in a reply to a message.",
    items: [
        {
            line: "Women's cut and finish",
            billedBy: "Per service",
            description: "Women's cut and blow-dry",
            qty: "1",
            rate: "50",
        },
        {
            line: "Men's cut",
            billedBy: "Per service",
            description: "Men's cut",
            qty: "1",
            rate: "25",
        },
        {
            line: "Child's cut",
            billedBy: "Per service, under 12",
            description: "Child's cut, under 12",
            qty: "1",
            rate: "15",
        },
        {
            line: "Full head colour",
            billedBy: "From, by hair length",
            description: "Full head colour, from",
            qty: "1",
            rate: "70",
        },
        {
            line: "Balayage",
            billedBy: "From, by hair length",
            description: "Balayage with toner, from",
            qty: "1",
            rate: "120",
        },
        {
            line: "Gel manicure",
            billedBy: "Per service",
            description: "Gel manicure",
            qty: "1",
            rate: "35",
        },
        {
            line: "Senior stylist",
            billedBy: "Per service, added",
            description: "Senior stylist, added to any cut",
            qty: "1",
            rate: "10",
        },
    ],
    fields: [
        {
            name: "Stylist level",
            why: "If a senior or director costs more, show the step on the menu.",
        },
        {
            name: "Hair length",
            why: "It changes colour time and product, and it's why you use from prices.",
        },
        {
            name: "How long each service takes",
            why: "A client planning a lunch break wants to know before booking.",
        },
    ],
    example: {
        number: "2026 price list",
        issued: "2026-01-05",
        client: { name: "" },
        facts: [
            { label: "Open", value: "Tue to Sat, 9 to 6" },
            { label: "Colour", value: "Patch test first" },
        ],
        note: "Colour prices depend on hair length and condition. Long colour bookings need a deposit.",
    },
    tips: [
        {
            title: "Explain what from really means",
            text: "Printed from prices cause trouble at the desk when they're vague. Say what makes colour cost more, such as length and thickness, and offer a free chat first.",
        },
        {
            title: "Show stylist levels only once",
            text: "Three prices for every single service makes a menu unreadable. List a base price, then one line for the added cost of a senior or director's time.",
        },
        {
            title: "Group the way a client thinks",
            text: "Hair, then colour, then nails, then take-home products. Someone booking a manicure shouldn't have to read past thirty colour lines to find the price they want.",
        },
    ],
    faqs: [
        {
            question:
                "Should a salon charge men and women differently for a cut?",
            answer: "Many now price by time and hair length instead, which is easier to defend if someone asks. Consider names such as short cut and long cut. Pick what fits your clients, and check any local fairness rules.",
        },
        {
            question: "How often should I update my salon menu?",
            answer: "Choose a time that suits you, often once a year, and date the page. Tell regular clients first, and remove every old copy from your website and booking page, so no one finds an outdated price.",
        },
        {
            question: "Should I show a deposit rule on the menu?",
            answer: "Yes, for long colour and big groups at least. One short sentence at the bottom saves an awkward message later. Name which services need one and how much notice gets it back.",
        },
    ],
};
