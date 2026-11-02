import type { Combo } from "../types";

export const quoteElectrician: Combo = {
    document: "quote",
    trade: "electrician",
    reviewed: false,
    lede: "Fix the price of an electrical job point by point: sockets, lights, the new board and testing, with the exact room each one goes in.",
    example: {
        number: "Q-0412",
        issued: "2026-04-28",
        due: "2026-05-12",
        terms: "custom",
        depositPlan: "30",
        facts: [
            { label: "Property", value: "6 Mill Street" },
            { label: "Rooms", value: "Kitchen and utility room" },
        ],
        termsText:
            "Price covers the points listed and final testing. Plastering and decorating are not included. Any point added on the day is priced before fitting.",
        note: "",
    },
    tips: [
        {
            title: "Attach a room-by-room plan",
            text: "Clients decide where a socket goes after the cable is in. Agreeing positions on a marked floor plan up front prevents costly rework, and settles arguments about what was promised.",
        },
        {
            title: "Name the fittings, or who buys them",
            text: "A downlight can cost a little or a lot. Say whether your price includes a named fitting, or expects the client to supply it, before they pick something unusual online.",
        },
        {
            title: "Coordinate with the other trades",
            text: "On a kitchen refit you depend on the fitter's timing. Write how many visits your price covers, first fix and second fix, so a third trip gets billed fairly.",
        },
    ],
    faqs: [
        {
            question: "How do I price first fix and second fix on one quote?",
            answer: "Show them as two lines, since they often sit weeks apart. It makes clear why you're coming back, and lets you ask for part of the money after cables go in, before the walls close.",
        },
        {
            question: "What if a client wants to supply their own lights?",
            answer: "You can agree, with limits. State that you fit only products suited to the location and that any warranty on them sits with the seller. Add a fitting price per light so your labour stays covered.",
        },
        {
            question: "Should my quote mention sign-off and building notices?",
            answer: "Yes, where your area requires them. Rules differ from place to place, so check the local position, then say who applies and who pays. A homeowner shouldn't learn about that step at the end.",
        },
        {
            question: "How long should an electrical quote stay open?",
            answer: "Choose a date you can honestly hold, considering how often copper cable and board prices shift at your wholesaler. Print the expiry clearly, and re-price anything accepted after it instead of absorbing the difference yourself.",
        },
    ],
    band: {
        title: "Every point, priced.",
        line: "Send the quote from site, collect the first payment through your own link and book in the first fix. 0% fees.",
    },
};
