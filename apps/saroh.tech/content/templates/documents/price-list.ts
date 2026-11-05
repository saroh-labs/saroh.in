import type { DocumentData } from "../types";

export const priceList: DocumentData = {
    slug: "price-list",
    name: "Price list",
    chip: "Price list",
    line: "Show what you sell and what it costs, on one page.",
    reviewed: false,
    lede: "A price list puts everything you offer on one clear page, each with its unit. Send it when someone asks what you charge, and spend less time answering the same message.",
    items: [
        {
            line: "Celebration cake, small",
            billedBy: "Per cake",
            description: "Celebration cake, serves 12",
            qty: "1",
            rate: "45",
        },
        {
            line: "Celebration cake, large",
            billedBy: "Per cake",
            description: "Celebration cake, serves 30",
            qty: "1",
            rate: "90",
        },
        {
            line: "Cupcakes",
            billedBy: "Per dozen",
            description: "Cupcakes, one flavour",
            qty: "1",
            rate: "30",
        },
        {
            line: "Biscuits",
            billedBy: "Per box",
            description: "Iced biscuits, box of 10",
            qty: "1",
            rate: "20",
        },
        {
            line: "Hand lettering",
            billedBy: "Per order",
            description: "Hand-piped message",
            qty: "1",
            rate: "5",
        },
        {
            line: "Delivery",
            billedBy: "Per trip",
            description: "Local delivery, within 10 miles",
            qty: "1",
            rate: "15",
        },
    ],
    payment: {
        text: "A price list doesn't ask for payment, but it's a good place to say how you take it. Clients decide faster when they can see the deposit, the notice you need and the last date to cancel at the same glance.",
        points: [
            "A deposit to confirm an order or booking",
            "The balance on collection or on the day",
            "How much notice you need to change or cancel",
        ],
    },
    fields: [
        {
            name: "The unit",
            why: "'30' means nothing alone. Per dozen, per hour or per visit tells people what they get for it.",
        },
        {
            name: "Valid until",
            why: "Date the list, so an old copy going around doesn't hold you to last year's prices.",
        },
        {
            name: "What's included",
            why: "Say what the price covers, such as delivery or tax, so the final bill isn't a surprise.",
        },
    ],
    example: {
        number: "2026 price list",
        issued: "2026-10-05",
        due: "2026-12-31",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Little Oak Cakes",
            email: "orders@example.com",
            address: "9 Bakehouse Lane",
        },
        client: { name: "" },
        note: "Prices include packaging. Orders need 7 days' notice and a 25% deposit to confirm.",
    },
    tips: [
        {
            title: "Group things the way people shop",
            text: "Put your most popular choice first, then the extras. People skim for what they came for, so a tidy order sells more than a long alphabetical list does.",
        },
        {
            title: "Show starting prices when jobs vary",
            text: "If the real price depends on size or detail, write 'from' and give the lowest honest figure. It keeps the list short, and it starts the right kind of conversation.",
        },
        {
            title: "Date every version",
            text: "Old lists keep circulating in inboxes for years. A date at the top lets you politely point out that prices have moved since the copy your customer found.",
        },
    ],
    faqs: [
        {
            question: "Should I put my prices online or send them on request?",
            answer: "If your work is mostly standard, publish them: it saves everyone time and filters out people who aren't a fit. If each job is very different, send a short list of starting prices, then follow it with a proper quote.",
        },
        {
            question: "Should prices on a list include tax?",
            answer: "Selling to the public, show the full price they'll actually pay. Selling to other businesses, showing prices before tax is normal, as long as you say so clearly near the top. Either way, say which one it is, once.",
        },
        {
            question: "How often should I update my price list?",
            answer: "At least once a year, and whenever your own costs move enough to hurt. Give regular customers some notice before a rise. A small yearly change is much easier for them to accept than a large jump after several quiet years.",
        },
        {
            question: "Is a price list the same as a quote?",
            answer: "No. A list is general and open to anyone, while a quote is one price for one client and one job. When an order needs anything beyond the list, follow up with a quote that says exactly what you've agreed to.",
        },
    ],
};
