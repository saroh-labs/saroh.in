import type { Combo } from "../types";

export const estimatePlumber: Combo = {
    document: "estimate",
    trade: "plumber",
    reviewed: false,
    lede: "For leaks and old pipework you can't see into yet. Give the likely hours and parts, say what lies behind the wall is unknown, and agree how extras get approved.",
    items: [
        {
            line: "Finding the leak",
            billedBy: "Hours, as a best guess",
            description: "Trace the leak, hours",
            qty: "2",
            rate: "60",
        },
        {
            line: "Access",
            billedBy: "Per opening",
            description: "Lift floorboards, openings",
            qty: "2",
            rate: "50",
        },
        {
            line: "Repair labour",
            billedBy: "Per hour, likely",
            description: "Repair labour, likely hours",
            qty: "5",
            rate: "60",
        },
        {
            line: "Pipe and fittings",
            billedBy: "An allowance, then actual cost",
            description: "Pipe and fittings, allowance",
            qty: "1",
            rate: "100",
        },
        {
            line: "Drain camera",
            billedBy: "A flat fee, if needed",
            description: "Camera survey of the drain",
            qty: "1",
            rate: "120",
        },
        {
            line: "Making good",
            billedBy: "Left out, or a flat fee",
            description: "Refit boards after repair",
            qty: "1",
            rate: "80",
        },
    ],
    payment: {
        text: "No money is owed for the figure. If you charge to come out and look, say so on the phone. After that, bill real hours and the parts you actually fit.",
        points: [
            "Any charge for the look-see agreed beforehand",
            "Extra work agreed before it's done",
            "Final bill based on hours worked and parts fitted",
        ],
    },
    fields: [
        {
            name: "What you couldn't see",
            why: "Name it: the pipe behind the tiles, or the condition of the stack.",
        },
        {
            name: "Making good",
            why: "Say if you put back the floors and tiles you lift. Clients often assume you will.",
        },
        {
            name: "Water off when",
            why: "A household or a shop needs warning of when it will be without water.",
        },
    ],
    example: {
        number: "EST-0210",
        client: { name: "Client name", address: "9 Willow Street" },
        facts: [
            { label: "Job address", value: "9 Willow Street" },
            { label: "Fault", value: "Damp under kitchen floor" },
        ],
        note: "Replacing tiles or flooring isn't included unless listed.",
        termsText:
            "This is an estimate, not a fixed price. We can't see behind floors or walls until they're opened. We will call you before any extra work.",
    },
    tips: [
        {
            title: "Say what you've not seen",
            text: "An old galvanised run might crumble the moment it's touched. Write that you can't be sure of what's under the floor, and a bigger bill later won't seem like a trick.",
        },
        {
            title: "Spell out making good",
            text: "You fixed the leak, but the kitchen floor is still up. Say who puts tiles and plaster back, or the homeowner may assume you will and feel let down at the end.",
        },
        {
            title: "Get a phone number for approvals",
            text: "A landlord who's hard to reach can leave you waiting on site with a hole in the wall. Ask who approves extras, and write their number on the page.",
        },
    ],
    faqs: [
        {
            question: "Should I charge for coming out to look at a leak?",
            answer: "That's up to you, but tell them when they ring. A small repair can be priced by eye, while tracing a hidden leak is real work. Many people accept a fee when it comes off the bill if they go ahead.",
        },
        {
            question: "How do I estimate a boiler swap before seeing the flue?",
            answer: "Ask for photos of the boiler, the flue and the gas meter before giving a figure. List what you've assumed, such as the boiler staying where it is. Moving it, or a new flue route, would change your number a lot.",
        },
        {
            question: "What if I find a second fault while fixing the first?",
            answer: "Stop, take a photo and send it to whoever's paying. Offer a price for the second fault, and let them choose. If it's dangerous, say so plainly, make it safe and tell them why you won't leave it.",
        },
        {
            question: "Can an insurance company use my estimate for a claim?",
            answer: "Often, yes, but ask the customer what their insurer wants. They may need the cause of the damage, photos and separate figures for tracing and repairing. Stick to what you saw, and don't guess at the cause.",
        },
    ],
    band: {
        title: "The price before the floor comes up.",
        line: "Send it from the job and let the customer or landlord approve it online, with the time recorded.",
    },
};
