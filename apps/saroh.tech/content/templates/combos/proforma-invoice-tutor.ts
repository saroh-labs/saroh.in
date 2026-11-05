import type { Combo } from "../types";

export const proformaInvoiceTutor: Combo = {
    document: "proforma-invoice",
    trade: "tutor",
    reviewed: false,
    lede: "Ask a school, a charity or an employer's team for money before a course starts, with sessions, group size and term dates set out for their finance office.",
    items: [
        {
            line: "Group course",
            billedBy: "Per term, per group",
            description: "Reading support group, autumn term",
            qty: "2",
            rate: "900",
        },
        {
            line: "Starting assessments",
            billedBy: "Per student",
            description: "Starting assessments, students",
            qty: "12",
            rate: "25",
        },
        {
            line: "One-to-one sessions",
            billedBy: "Per hour",
            description: "One-to-one support, hours",
            qty: "10",
            rate: "40",
        },
        {
            line: "Course materials",
            billedBy: "Per student pack",
            description: "Workbook packs, students",
            qty: "12",
            rate: "10",
        },
        {
            line: "Written reports",
            billedBy: "Per student, per term",
            description: "End of term reports, students",
            qty: "12",
            rate: "10",
        },
        {
            line: "Staff briefing",
            billedBy: "Per session",
            description: "Briefing for school staff",
            qty: "1",
            rate: "100",
        },
    ],
    example: {
        number: "PRO-0715",
        issued: "2026-07-13",
        due: "2026-08-03",
        terms: "custom",
        client: {
            name: "School finance office",
            email: "finance@example.com",
            address: "School address",
        },
        facts: [
            { label: "Course", value: "Reading support, Year 7" },
            { label: "Term dates", value: "7 Sep to 18 Dec" },
            { label: "Order no.", value: "Their order number" },
        ],
        note: "Not a tax invoice. A final invoice follows when the course begins and lists this payment as received.",
    },
    tips: [
        {
            title: "Send it before the budget closes",
            text: "Schools and charities spend from set budgets, and those deadlines don't move for you. Ask when the next one falls, then send your paperwork a good while before.",
        },
        {
            title: "Ask for their order number",
            text: "Many finance offices can't pay without a purchase order. Getting that number and printing it near the top keeps your request away from a pile of queries.",
        },
        {
            title: "List students by count, not name",
            text: "A finance clerk has no need to see children's names. Keep this paper to group sizes, and share the actual list only with the teacher who runs the programme.",
        },
    ],
    faqs: [
        {
            question: "Why would a school want this rather than an invoice?",
            answer: "It lets them raise a payment or get approval before anything has been delivered. Their auditors may not want a final invoice dated before the first lesson, so check which paper their office actually needs.",
        },
        {
            question: "Can a private family use one for a term of lessons?",
            answer: "They can, though a simple quote usually does the job. It helps where a grandparent, a bursary or an employer's benefit pays and needs a formal paper first. Ask who releases the money before choosing.",
        },
        {
            question: "What if fewer students sign up than I listed?",
            answer: "Say in your terms how the numbers get settled. You might bill the agreed minimum regardless, or adjust per student on the final invoice, then return any difference. Decide before they send you the funds.",
        },
    ],
};
