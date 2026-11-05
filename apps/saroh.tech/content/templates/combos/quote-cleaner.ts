import type { Combo } from "../types";

export const quoteCleaner: Combo = {
    document: "quote",
    trade: "cleaner",
    reviewed: false,
    lede: "A fixed price for a regular contract or a set job: how often you come, what gets cleaned each time, and who supplies products and keys.",
    items: [
        {
            line: "Office clean",
            billedBy: "Per visit",
            description: "Office clean, weekday evenings",
            qty: "20",
            rate: "50",
        },
        {
            line: "Washroom restock",
            billedBy: "Per month",
            description: "Washroom supplies restock",
            qty: "1",
            rate: "60",
        },
        {
            line: "Kitchen deep clean",
            billedBy: "Per quarter",
            description: "Staff kitchen deep clean",
            qty: "1",
            rate: "120",
        },
        {
            line: "Glass",
            billedBy: "Per clean",
            description: "Inside glass partitions",
            qty: "2",
            rate: "60",
        },
        {
            line: "Floor care",
            billedBy: "Per area",
            description: "Hard floor polish, areas",
            qty: "2",
            rate: "90",
        },
        {
            line: "First clean",
            billedBy: "A one-time fee",
            description: "First clean to bring up to standard",
            qty: "1",
            rate: "250",
        },
    ],
    payment: {
        text: "For regular work, the quote should fix the monthly amount and when it's billed. For a set job, say if it's paid on the day. Put any price review date on the page.",
        points: [
            "Monthly amount billed in advance or after",
            "A one-off first clean billed on its own",
            "Set job paid when you finish",
        ],
    },
    fields: [
        {
            name: "Task list by frequency",
            why: "Daily, weekly and monthly jobs, written out, are the real contract.",
        },
        {
            name: "Keys and alarm",
            why: "Say who holds them, and how they're kept, because a client handing them over wants to know.",
        },
        {
            name: "Notice period",
            why: "State how much notice either side gives to end a regular contract.",
        },
    ],
    example: {
        number: "Q-0108",
        client: { name: "Client company", address: "Unit 4, Mill Lane" },
        facts: [
            { label: "Visits", value: "Mon to Fri, after 6 pm" },
            { label: "Keys", value: "1 set, signed for" },
        ],
        note: "We bring our own products. Washroom supplies are listed separately.",
        termsText:
            "Price covers the tasks and visits listed. Either side may end this with 30 days' notice. Added work is quoted first.",
    },
    tips: [
        {
            title: "Attach a task list",
            text: "'Clean the office' means something different to everyone. A list saying bins daily, desks weekly and fridge monthly settles a complaint in seconds, and it lets a new team member start right.",
        },
        {
            title: "Charge for bringing it up to standard",
            text: "A neglected place takes hours more on the first visit. Quote that as a one-off, so your regular price stays fair, and the client understands why the first bill looks larger.",
        },
        {
            title: "Name the review date",
            text: "Wages and supplies rise. Saying now that the price is looked at once a year makes that future letter feel normal, rather than a shock to a client who's been loyal.",
        },
    ],
    faqs: [
        {
            question:
                "Should a cleaning contract quote be per visit or per month?",
            answer: "Per month is easier for an office to budget, and it keeps you paid in shorter months. Show the visits per month as well, so it's clear what the amount covers. Say how a bank holiday visit is treated.",
        },
        {
            question: "Who pays for toilet rolls and soap on a contract?",
            answer: "Decide, then write it down. You can include them in the price, bill them each month at cost, or leave them to the client. Whichever you choose, say who orders them, because running out is what gets noticed.",
        },
        {
            question: "How should I quote a holiday let with changeovers?",
            answer: "Price per changeover, by the size of the property, with laundry on a separate line. Say how long you need between guests, and what happens on a same-day booking. Agree a fee for guests who leave the place in a poor state.",
        },
        {
            question: "What should I say about breakages and insurance?",
            answer: "If you hold public liability cover, say so, and offer to show it. Add how a breakage should be reported, and by when. An office or a landlord often asks this first, so the answer on the page earns trust.",
        },
    ],
};
