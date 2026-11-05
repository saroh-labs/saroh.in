import type { DocumentData } from "../types";

export const estimate: DocumentData = {
    slug: "estimate",
    name: "Estimate",
    chip: "Estimate",
    line: "Give a best guess of the cost before you start.",
    reviewed: false,
    lede: "An estimate tells your client what the job should cost, and says plainly that the number may move. Use this one when you can't fix the price yet.",
    items: [
        {
            line: "Labour",
            billedBy: "Per day, as a best guess",
            description: "Kitchen fit, days of labour",
            qty: "5",
            rate: "300",
        },
        {
            line: "Materials",
            billedBy: "An allowance, then actual cost",
            description: "Worktops and timber, allowance",
            qty: "1",
            rate: "1200",
        },
        {
            line: "Fixings",
            billedBy: "An allowance",
            description: "Screws, brackets and sealant",
            qty: "1",
            rate: "150",
        },
        {
            line: "Removal",
            billedBy: "A flat fee",
            description: "Take out the old units",
            qty: "1",
            rate: "250",
        },
        {
            line: "Waste",
            billedBy: "Per load",
            description: "Waste removal, loads",
            qty: "2",
            rate: "120",
        },
        {
            line: "Extra site visit",
            billedBy: "Per visit",
            description: "Measure-up visit",
            qty: "1",
            rate: "60",
        },
    ],
    payment: {
        text: "Nothing is owed on an estimate. It becomes money only when the client says yes and you do the work. Say up front how you will bill the difference if the real cost comes out higher or lower than the number here.",
        points: [
            "Nothing due until the client gives the go-ahead",
            "Materials allowance billed at actual cost",
            "Final invoice based on the real time spent",
        ],
    },
    fields: [
        {
            name: "The word Estimate",
            why: "It tells the client this is a best guess, so a higher final bill doesn't come as a broken promise.",
        },
        {
            name: "What could change the price",
            why: "Name the unknowns, such as hidden damage or a changed design, before they happen.",
        },
        {
            name: "Valid until",
            why: "Material prices move, so give the number a date after which you'd look at it again.",
        },
    ],
    example: {
        number: "EST-0001",
        issued: "2026-04-06",
        due: "2026-05-06",
        terms: "custom",
        currency: "USD",
        from: {
            name: "Harbour Joinery",
            email: "jobs@example.com",
            address: "8 Dock Road",
        },
        client: {
            name: "Sam Fielding",
            email: "sam@example.com",
            address: "21 Orchard Way",
        },
        facts: [{ label: "Site", value: "21 Orchard Way, kitchen" }],
        termsText:
            "This is an estimate, not a fixed price. If the work or materials look set to cost more than 10% above this total, we will ask you first.",
    },
    tips: [
        {
            title: "Show a range when you truly don't know",
            text: "If a wall might need repairs, say so and give both numbers. A client who saw the higher figure early rarely argues about it at the end of the job.",
        },
        {
            title: "Set a limit for going over",
            text: "Promise to check in before the cost passes a set point, such as 10% over. It costs you nothing, and it's the line that wins the job from a nervous client.",
        },
        {
            title: "Split labour from materials",
            text: "One big number invites haggling over all of it. Two clear lines let the client see that timber costs what it costs, and that your time is priced fairly.",
        },
    ],
    faqs: [
        {
            question: "Is an estimate legally binding?",
            answer: "An estimate is generally treated as a best guess, not a fixed promise, but the rules differ from place to place and a very wrong figure can still cause a dispute. Keep your wording clear, and get advice if the job is large.",
        },
        {
            question: "When should I use an estimate instead of a quote?",
            answer: "Use an estimate when you can't see the whole job yet: old buildings, repairs, work that depends on what you find. Use a quote once the work is clear enough for you to stand behind one fixed price.",
        },
        {
            question: "Can I charge for writing an estimate?",
            answer: "You can, as long as you say so before you turn up. Many people charge for a long site visit or detailed plans, then take that amount off the final bill if the client goes ahead with the work.",
        },
        {
            question: "What if the job ends up costing more than I estimated?",
            answer: "Tell the client as soon as you know, before you spend the extra. Explain what changed and give a new figure in writing. Surprises at the end of a job cause far more trouble than the extra amount does.",
        },
    ],
};
