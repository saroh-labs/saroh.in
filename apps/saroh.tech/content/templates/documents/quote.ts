import type { DocumentData } from "../types";

export const quote: DocumentData = {
    slug: "quote",
    name: "Quote",
    chip: "Quote",
    line: "Offer a fixed price your client can accept.",
    reviewed: false,
    lede: "A quote is a price you stand behind for a clear piece of work. This one has a valid-until date, a deposit line and space for your client to sign.",
    items: [
        {
            line: "Design",
            billedBy: "A fixed fee",
            description: "Website design, 5 pages",
            qty: "1",
            rate: "1500",
        },
        {
            line: "Build",
            billedBy: "A fixed fee per page",
            description: "Build and test, per page",
            qty: "5",
            rate: "300",
        },
        {
            line: "Words",
            billedBy: "Per page",
            description: "Copywriting, per page",
            qty: "5",
            rate: "80",
        },
        {
            line: "Set-up",
            billedBy: "A one-time fee",
            description: "Domain and email set-up",
            qty: "1",
            rate: "120",
        },
        {
            line: "Training",
            billedBy: "Per session",
            description: "Handover training session",
            qty: "1",
            rate: "150",
        },
        {
            line: "Care",
            billedBy: "Per month",
            description: "Hosting and updates, months",
            qty: "12",
            rate: "20",
        },
    ],
    payment: {
        text: "A quote says what the money will be and when it falls due, before a single hour is spent. Asking for part of it on acceptance tells you the client is serious and pays for your first days of work.",
        points: [
            "A deposit due when the quote is accepted",
            "Stage payments for jobs that run for weeks",
            "The balance on delivery, on the final invoice",
        ],
    },
    fields: [
        {
            name: "Valid until",
            why: "A date stops an old price from being accepted a year later, when your costs are different.",
        },
        {
            name: "What's not included",
            why: "One line on what's out of scope prevents most arguments about extra work.",
        },
        {
            name: "Signature and date",
            why: "A signed quote is clear proof of what was agreed, and when it was agreed.",
        },
    ],
    example: {
        number: "Q-0001",
        issued: "2026-05-04",
        due: "2026-05-18",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Northgate Web",
            email: "studio@example.com",
            address: "30 Station Road",
        },
        client: {
            name: "Fern and Thistle",
            email: "owner@example.com",
            address: "2 Market Row",
        },
        depositPlan: "30",
        termsText:
            "Price covers the work listed here. Further changes are billed by the hour, agreed first. Balance is due on launch.",
    },
    tips: [
        {
            title: "Write down what isn't included",
            text: "'Two rounds of changes, photos supplied by you' saves far more trouble than it takes to type. Clients don't read your mind, and scope creep starts in the gaps.",
        },
        {
            title: "Give it an end date",
            text: "Two weeks is enough for most small jobs. A deadline gently moves a decision along, and it protects you from honouring a price long after your own costs have risen.",
        },
        {
            title: "Ask for the deposit in the quote",
            text: "Don't bring up money again after the yes. Put the deposit percentage on the quote itself, so accepting the price and paying the first part feel like a single step.",
        },
    ],
    faqs: [
        {
            question: "What's the difference between a quote and an estimate?",
            answer: "A quote is a fixed price: if the client says yes, that's what the listed work costs. An estimate is a best guess that can move. Pick the word on purpose, because your client will hold you to what it says.",
        },
        {
            question: "How long should a quote stay valid?",
            answer: "Thirty days is a common choice, and two weeks suits jobs where your costs change quickly. Pick a period you can live with. After that date you can still honour the price, but you aren't obliged to.",
        },
        {
            question: "Can I change a quote after sending it?",
            answer: "Yes, until the client says yes to it. Send a new version with a new number and say clearly that it replaces the old one. After acceptance, any change should be agreed in writing and added as its own line.",
        },
        {
            question: "How much deposit should I ask for on a quote?",
            answer: "It's your call, and it depends on how much you spend before the work is delivered. Many freelancers choose somewhere between 20% and 50%. A higher share makes sense when you buy materials up front or turn other work away.",
        },
    ],
};
