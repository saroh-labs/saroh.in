import type { Combo } from "../types";

export const invoiceTutor: Combo = {
    document: "invoice",
    trade: "tutor",
    reviewed: false,
    lede: "Bill a month of lessons with the student's name, the subject, the dates taught and any marking, addressed to the parent or school that pays.",
    example: {
        number: "INV-0715",
        issued: "2026-09-30",
        due: "2026-10-07",
        terms: "custom",
        facts: [
            { label: "Student", value: "Student name" },
            { label: "Subject", value: "Maths, age 15" },
            { label: "Lessons", value: "2, 9, 16 and 23 Sep" },
        ],
    },
    tips: [
        {
            title: "Bill the parent, name the student",
            text: "The person paying isn't the person learning, and surnames can differ. Put both on the page so a busy parent can spot the bill in a crowded inbox.",
        },
        {
            title: "Write out each lesson date",
            text: "Four hours in September means little to a family with a full calendar. Dates let them check against their own diary, and they settle any question about a missed week.",
        },
        {
            title: "Show a sibling on separate lines",
            text: "Two children on one bill is easier for the parent than two invoices. Give each child their own lines and subject, so the family sees who had which lessons.",
        },
    ],
    faqs: [
        {
            question: "Can I bill for a lesson a student didn't turn up to?",
            answer: "If your terms set a notice period, yes. Add a line saying the lesson was missed, with its date, at the agreed amount. Offering one free catch-up a term can keep the family's goodwill.",
        },
        {
            question: "Should lessons be billed before or after they happen?",
            answer: "In advance protects your timetable, since a paid slot tends to be kept. After teaching feels kinder but risks late money. Whichever you choose, tell the family when they join, and bill on the same date monthly.",
        },
        {
            question: "A school or charity is paying. What changes?",
            answer: "Address it to their finance contact and quote their order number. They may want the student shown as initials for privacy, along with hours taught. Ask them what format they need before you send your first bill.",
        },
        {
            question: "Can I charge for time spent preparing lessons?",
            answer: "It's normally built into your hourly price. If a family asks for custom exam packs or written reports, that's different. Agree it first, then bill it as a named piece of work with its own line.",
        },
    ],
};
