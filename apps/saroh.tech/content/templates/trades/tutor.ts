import type { TradeData } from "../types";

export const tutor: TradeData = {
    reviewed: false,
    lede: "Made for teaching: lessons by the hour, term blocks, small groups, marked papers and books, with the student's name beside the parent who pays. Pick the document you need.",
    items: [
        {
            line: "One-to-one lessons",
            billedBy: "Per hour",
            description: "Maths lessons, one-to-one, hours",
            qty: "8",
            rate: "40",
        },
        {
            line: "Lesson block",
            billedBy: "Per block of lessons",
            description: "Block of 10 chemistry lessons",
            qty: "1",
            rate: "350",
        },
        {
            line: "Small group",
            billedBy: "Per student, per session",
            description: "Revision group, sessions",
            qty: "4",
            rate: "20",
        },
        {
            line: "Marking",
            billedBy: "Per paper",
            description: "Practice papers marked",
            qty: "3",
            rate: "15",
        },
        {
            line: "Books and materials",
            billedBy: "Per item",
            description: "Workbook and past paper pack",
            qty: "1",
            rate: "25",
        },
        {
            line: "Travel",
            billedBy: "Per trip",
            description: "Travel to student's home, trips",
            qty: "8",
            rate: "5",
        },
    ],
    payment: {
        text: "Lessons are often paid for ahead by the month or the term, which protects your timetable. Parents who pay after each lesson need a short note on what a missed lesson costs.",
        points: [
            "A term or a block paid up front",
            "A monthly bill for weekly lessons",
            "A clear rule for missed lessons",
        ],
    },
    fields: [
        {
            name: "Student name",
            why: "The parent pays, but it's the student's lessons being billed, and families can have more than one child with you.",
        },
        {
            name: "Subject and level",
            why: "A parent or a school funding the lessons will want to see what was taught.",
        },
        {
            name: "Lesson dates",
            why: "Dates let a parent match the bill against the calendar on the fridge.",
        },
    ],
    example: {
        from: {
            name: "Your Tutoring",
            email: "hello@example.com",
            address: "Your address",
        },
        client: { name: "Parent name" },
        facts: [
            { label: "Student", value: "Student name" },
            { label: "Subject", value: "Maths, age 15" },
        ],
        note: "Lessons cancelled with less than 24 hours' notice are charged in full.",
    },
};
