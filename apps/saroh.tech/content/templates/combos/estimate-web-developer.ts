import type { Combo } from "../types";

export const estimateWebDeveloper: Combo = {
    document: "estimate",
    trade: "web-developer",
    reviewed: false,
    lede: "For web work you can't fully see yet: an old codebase, a data move, an outside system with thin docs. Give hours by feature and name the unknowns.",
    items: [
        {
            line: "Code review",
            billedBy: "Hours, as a best guess",
            description: "Review the existing code, hours",
            qty: "8",
            rate: "60",
        },
        {
            line: "Features",
            billedBy: "Hours per feature",
            description: "Booking feature, likely hours",
            qty: "30",
            rate: "60",
        },
        {
            line: "Data move",
            billedBy: "Hours, depends on the data",
            description: "Move old orders across, hours",
            qty: "12",
            rate: "60",
        },
        {
            line: "Connections",
            billedBy: "Per connection, best guess",
            description: "Connect the payment system",
            qty: "1",
            rate: "500",
        },
        {
            line: "Testing",
            billedBy: "Hours",
            description: "Testing on phones and browsers",
            qty: "10",
            rate: "50",
        },
        {
            line: "Contingency",
            billedBy: "An allowance, used only if needed",
            description: "Allowance for unknowns",
            qty: "1",
            rate: "400",
        },
    ],
    payment: {
        text: "Nothing is owed yet, unless you agreed a paid review of the code first. After the go-ahead, hours are billed as they are worked, and you warn the client before the figure is passed.",
        points: [
            "Paid discovery can be billed on its own",
            "Hours billed weekly or by sprint after the go-ahead",
            "Contingency billed only when it's really used",
        ],
    },
    fields: [
        {
            name: "Assumptions",
            why: "List what you took for granted, such as access to the old server or working test data.",
        },
        {
            name: "Hours per feature",
            why: "The client can drop a feature to fit a budget, instead of asking for a discount.",
        },
        {
            name: "Outside systems",
            why: "Name each one you depend on. Their limits and delays aren't in your control.",
        },
    ],
    example: {
        number: "EST-0421",
        facts: [
            { label: "Site", value: "shop.example.com" },
            { label: "Assumes", value: "Access to old server" },
        ],
        note: "Domain and hosting stay in the client's name.",
        termsText:
            "This is an estimate, not a fixed price. Hours are our best guess until the old code has been reviewed. We will ask before going past this total.",
    },
    tips: [
        {
            title: "Sell the discovery first",
            text: "On an inherited site, a small paid review of the code cuts the guesswork. The client gets a useful report either way, and you avoid betting a whole project on a glance.",
        },
        {
            title: "Show contingency openly",
            text: "Hiding a buffer inside the hours makes every feature look padded. A named allowance, spent only when needed and shown on the bill, earns far more trust than a low number.",
        },
        {
            title: "Give each feature its own hours",
            text: "A client on a tight budget can then choose what waits for phase two. That talk goes much better than one where you're asked to knock a fifth off everything.",
        },
    ],
    faqs: [
        {
            question: "How do I estimate work on code I haven't seen?",
            answer: "Don't guess from the outside. Ask for read access, spend a few paid hours looking, then write the figure. If the client refuses access, make your range wide and say why, so the width of it doesn't look careless.",
        },
        {
            question: "Should I estimate in hours or in sprints?",
            answer: "Use whichever the client already thinks in. Hours suit a shop owner who wants a small change. Sprints suit a product team with a backlog. In both cases, list what you expect to finish, not just the time.",
        },
        {
            question:
                "What if an outside system turns out to be badly documented?",
            answer: "Flag it in the estimate before you start, as a named risk. When it happens, stop and tell the client how much more time it needs. They may have a contact at the provider who can shorten the wait.",
        },
        {
            question: "Do I include the client's own testing time?",
            answer: "Not as a charge, but do mention it. Say how many days they'll need to check the work and give feedback. Slow replies push your dates back, and an estimate is the right place to say so early.",
        },
    ],
    band: {
        title: "Unknowns named, work approved.",
        line: "Send the estimate as a link. When they approve it online, start the build with the numbers already agreed.",
    },
};
