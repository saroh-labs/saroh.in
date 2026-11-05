import type { Combo } from "../types";

export const receiptTutor: Combo = {
    document: "receipt",
    trade: "tutor",
    reviewed: false,
    lede: "Give a parent proof of what they paid for a lesson block: the child's name, lessons bought and how many are left, ready for grants or employer schemes.",
    example: {
        number: "RCT-0715",
        issued: "2026-09-01",
        due: "",
        terms: "custom",
        facts: [
            { label: "Paid on", value: "1 Sep 2026" },
            { label: "Paid by", value: "Bank transfer" },
            { label: "Student", value: "Student name" },
            { label: "Lessons left", value: "10 of 10" },
        ],
        note: "Thank you. Lessons in a block are used by the end of term.",
    },
    tips: [
        {
            title: "Write how many lessons are left",
            text: "A block paid for in September feels distant by November. A count on every slip saves a parent asking you, and gives them warning before the next block falls due.",
        },
        {
            title: "Show your name and subject in full",
            text: "A grant body or a parent's employer may need to see who taught what. A nickname and a phone number won't satisfy them, while a full business name and course will.",
        },
        {
            title: "Send it to the payer, not the student",
            text: "A teenager may hand you the envelope, but it's their parent's money. Email the slip to the adult, so that cash passed through a child is clearly accounted for.",
        },
    ],
    faqs: [
        {
            question: "A student handed me cash in class. What should I do?",
            answer: "Count it with them, then message the parent that evening to confirm the sum with this slip attached. Having it confirmed directly protects you, and protects the child from being asked where that money went.",
        },
        {
            question: "Can a parent reclaim lesson costs with this?",
            answer: "It depends on who funds them and what they accept. Ask the scheme what it requires, often the student's name, the provider and dates taught. We can't say whether any given claim will pay.",
        },
        {
            question: "How do I record a refund for unused lessons?",
            answer: "Don't alter the old slip. Write a new note showing the lessons returned and money sent back, referring to that first receipt number, so the family and your own books both tell the same story.",
        },
    ],
};
