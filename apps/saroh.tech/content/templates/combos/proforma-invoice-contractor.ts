import type { Combo } from "../types";

export const proformaInvoiceContractor: Combo = {
    document: "proforma-invoice",
    trade: "contractor",
    reviewed: false,
    lede: "Ask for money before a building job begins: long-lead materials and site setup, set out so an owner or their lender can release the funds.",
    items: [
        {
            line: "Long-lead materials",
            billedBy: "Per order, before delivery",
            description: "Roof trusses, made to order",
            qty: "1",
            rate: "3000",
        },
        {
            line: "Windows and doors",
            billedBy: "Per unit, on order",
            description: "Aluminium windows, on order",
            qty: "4",
            rate: "600",
        },
        {
            line: "Site setup",
            billedBy: "A flat fee per job",
            description: "Fencing, welfare unit and setup",
            qty: "1",
            rate: "800",
        },
        {
            line: "Scaffold",
            billedBy: "Per week, booked ahead",
            description: "Scaffold hire, weeks booked",
            qty: "6",
            rate: "250",
        },
        {
            line: "Crew booking",
            billedBy: "Per person day held",
            description: "First week of crew, person days",
            qty: "10",
            rate: "200",
        },
        {
            line: "Skip booking",
            billedBy: "Per skip or dumpster",
            description: "First skips, delivered to site",
            qty: "2",
            rate: "300",
        },
    ],
    example: {
        number: "PRO-0302",
        issued: "2026-03-09",
        due: "2026-03-23",
        terms: "custom",
        facts: [
            { label: "Site", value: "12 Quarry Lane, rear extension" },
            { label: "Start date", value: "When funds are received" },
        ],
        note: "Not a tax invoice. A proper invoice follows for each stage, with this payment shown as received.",
    },
    tips: [
        {
            title: "Price only what you must pay out",
            text: "Trusses made to order can't be returned. Keep this document to items you're buying up front, and the owner sees a reason for the money, not a loan to your firm.",
        },
        {
            title: "Tie the start date to the funds",
            text: "A start date with no link to payment leaves your crew waiting. Say that work begins a set number of days after the money clears, and your calendar stays yours.",
        },
        {
            title: "Carry it over to stage bills",
            text: "When the first real invoice goes out, show this advance as money already received. Owners paying large sums will check, and a missing line looks like you've billed them twice.",
        },
    ],
    faqs: [
        {
            question: "Will a lender release funds against this document?",
            answer: "Some will, but each has its own rules. Ask the owner what their bank or finance company needs, such as the site address or your company details, and add these before you send it across.",
        },
        {
            question:
                "What if the job is called off after trusses are ordered?",
            answer: "Your terms should say that made-to-order goods stay payable once placed. Refund any part you haven't spent, keep the supplier's order as proof, and record that return of money in a credit note or a letter.",
        },
        {
            question: "Why not send a normal invoice for the advance?",
            answer: "An invoice records a sale, and may bring tax into your books from that date. This is only a request for money ahead of work. Ask your accountant how to treat the advance once it lands.",
        },
        {
            question: "Can a public body or company pay from this?",
            answer: "Plenty of purchasing teams need one to raise a payment order. Ask for their order number, print it in the facts at the top, and check who should receive the paperwork, since it's rarely the site manager.",
        },
    ],
};
