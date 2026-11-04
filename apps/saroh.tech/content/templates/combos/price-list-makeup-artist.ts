import type { Combo } from "../types";

export const priceListMakeupArtist: Combo = {
    document: "price-list",
    trade: "makeup-artist",
    reviewed: false,
    lede: "Your bridal, party, prom and lesson rates on one page, with the extras spelled out, to send when an enquiry asks how much for six people in June.",
    items: [
        {
            line: "Bridal package",
            billedBy: "Per bride, trial included",
            description: "Bridal makeup with one trial",
            qty: "1",
            rate: "400",
        },
        {
            line: "Bridesmaid or guest",
            billedBy: "Per person",
            description: "Guest makeup, about 45 minutes",
            qty: "1",
            rate: "80",
        },
        {
            line: "Prom or party look",
            billedBy: "Per person",
            description: "Prom or evening makeup",
            qty: "1",
            rate: "60",
        },
        {
            line: "Makeup lesson",
            billedBy: "Per lesson",
            description: "One-to-one lesson, 90 minutes",
            qty: "1",
            rate: "75",
        },
        {
            line: "Lashes",
            billedBy: "Per set",
            description: "Strip lashes, applied",
            qty: "1",
            rate: "15",
        },
        {
            line: "Early start",
            billedBy: "Per hour before 7 am",
            description: "Start before 7 am",
            qty: "1",
            rate: "40",
        },
    ],
    fields: [
        {
            name: "Time per face",
            why: "It tells a bride how early she must begin, before she has to ask.",
        },
        {
            name: "Minimum booking",
            why: "State it if a far drive isn't worth it for one person.",
        },
        {
            name: "Travel area",
            why: "Say which places are included, and what going further adds per mile.",
        },
    ],
    example: {
        number: "2026 price list",
        issued: "2026-01-05",
        client: { name: "" },
        facts: [
            { label: "Travel included", value: "Within 15 miles" },
            { label: "Weekend minimum", value: "3 people" },
        ],
        note: "A retainer holds your date. Prices don't include parking at the venue.",
    },
    tips: [
        {
            title: "Say what the bridal price includes",
            text: "A trial, a touch-up kit and lashes might all be in it, or none of them. List them, so a bride can compare you fairly with another artist's headline number.",
        },
        {
            title: "Separate weekend from weekday if you price them apart",
            text: "Saturdays in peak months are what you have the fewest of. If a quiet Tuesday costs less, show both, and let the person with flexible plans choose it.",
        },
        {
            title: "Put a photo link beside the list",
            text: "People buy makeup with their eyes, so a price alone can feel high. Add a link to your portfolio beside your name, and the rate has something to stand on.",
        },
    ],
    faqs: [
        {
            question:
                "Should makeup artists publish a bridal price or say from?",
            answer: "If trial, party size and travel change the total, a from price is honest and short. Name what that figure covers. People then know a starting point, and what could lift it, before they write to you.",
        },
        {
            question: "How do I price a group discount, if I offer one?",
            answer: "Give it a clear point, such as 6 people or more, and write the reduced per-person rate on this list. Keeping that rule visible means you won't be talked into a smaller reduction for each new group.",
        },
        {
            question: "Do I list airbrush as a separate price?",
            answer: "Yes, if it uses different products or takes longer. A small add-on line per person makes it a clear choice. Anyone who doesn't know the term can ask, and that's a useful chat to have.",
        },
    ],
};
