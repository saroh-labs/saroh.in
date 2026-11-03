import type { Combo } from "../types";

export const priceListEventPlanner: Combo = {
    document: "price-list",
    trade: "event-planner",
    reviewed: false,
    lede: "Your planning packages, hourly advice and day-of services on one page, each saying what's done and what isn't, for couples and companies comparing planners.",
    items: [
        {
            line: "Full planning",
            billedBy: "From, per event",
            description: "Full planning, start to finish",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Part planning",
            billedBy: "From, per event",
            description: "Part planning, last 3 months",
            qty: "1",
            rate: "1200",
        },
        {
            line: "Day-of coordination",
            billedBy: "Per event",
            description: "Coordination on the day, final month",
            qty: "1",
            rate: "800",
        },
        {
            line: "Advice session",
            billedBy: "Per hour",
            description: "Planning advice, 1 hour",
            qty: "1",
            rate: "75",
        },
        {
            line: "Supplier shortlist",
            billedBy: "Per category",
            description: "Three vetted suppliers, per category",
            qty: "1",
            rate: "100",
        },
        {
            line: "Extra assistant",
            billedBy: "Per hour",
            description: "Extra assistant on the day",
            qty: "1",
            rate: "25",
        },
    ],
    fields: [
        {
            name: "Event size each price assumes",
            why: "State the guest limit, since a package for 50 won't suit a dinner for 300.",
        },
        {
            name: "Months of work included",
            why: "How far before the event you start is what separates your packages.",
        },
        {
            name: "Supplier costs not included",
            why: "One clear line keeps a client from thinking the fee covers the food.",
        },
    ],
    example: {
        number: "2026 price list",
        issued: "2026-01-05",
        client: { name: "" },
        facts: [
            { label: "Prices cover", value: "Up to 150 guests" },
            { label: "Booking", value: "6 months ahead" },
        ],
        note: "Fees are for planning work only. Venue, food, decor and other supplier costs aren't included.",
    },
    tips: [
        {
            title: "Tell people what each tier leaves out",
            text: "Day-of coordination isn't planning, though many couples assume it is. Write what the client must have booked before you step in, so the difference is clear at a glance.",
        },
        {
            title: "Use from, and explain what moves it",
            text: "Events vary too much for one fixed number. A from price, followed by guest count, days on site and travel, is honest and invites the right conversation.",
        },
        {
            title: "Sell the small step first",
            text: "An hour's advice is a simple yes for someone unsure about hiring a planner. Many larger bookings could begin there, so keep it on the list where people can find it.",
        },
    ],
    faqs: [
        {
            question: "Do couples and companies need different price lists?",
            answer: "Often they do. A couple compares packages and wants to hear about the day. A company wants delegate numbers and service lines. A separate page for each keeps the wording right, and neither reader has to skip over the other's.",
        },
        {
            question: "Should I name my planning package tiers?",
            answer: "Plain names work well. Full planning, part planning and day-of coordination describe themselves, and nobody needs to remember what your gold tier meant. Clear names also make comparing you with other planners easy.",
        },
        {
            question: "How do I price a destination event on this list?",
            answer: "Leave it out of the main rates, and add one line saying that travel and nights away are quoted for each job. It's honest, keeps the page short and invites the client to ask.",
        },
    ],
    band: {
        title: "Clear packages, before the first call.",
        line: "Send your list, and take the booking fee through your own link when they choose. 0% fees.",
    },
};
