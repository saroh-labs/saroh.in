import type { Combo } from "../types";

export const priceListTutor: Combo = {
    document: "price-list",
    trade: "tutor",
    reviewed: false,
    lede: "Put your lessons on one page by level and length, with blocks and small groups, to share in a parents' group or pin up at a school gate.",
    items: [
        {
            line: "Primary lessons",
            billedBy: "Per hour",
            description: "Primary maths or English, per hour",
            qty: "1",
            rate: "30",
        },
        {
            line: "Secondary lessons",
            billedBy: "Per hour",
            description: "Secondary lessons, per hour",
            qty: "1",
            rate: "40",
        },
        {
            line: "Exam year lessons",
            billedBy: "Per hour",
            description: "Exam year lessons, per hour",
            qty: "1",
            rate: "50",
        },
        {
            line: "Block of ten",
            billedBy: "Per block, paid ahead",
            description: "Block of 10 secondary lessons",
            qty: "1",
            rate: "350",
        },
        {
            line: "Small group",
            billedBy: "Per student, per session",
            description: "Group of up to 4, per student",
            qty: "1",
            rate: "20",
        },
        {
            line: "Paper marking",
            billedBy: "Per paper, with feedback",
            description: "Paper marked with feedback",
            qty: "1",
            rate: "15",
        },
    ],
    example: {
        number: "2026-27 lessons",
        issued: "2026-08-03",
        due: "2027-07-31",
        terms: "custom",
        client: { name: "" },
        facts: [
            { label: "Subjects", value: "Maths and science" },
            { label: "Where", value: "Online, or at your home" },
        ],
        note: "Home visits within 5 miles. Lessons cancelled with less than 24 hours' notice are charged in full.",
    },
    tips: [
        {
            title: "Run it by school year",
            text: "Families plan in terms, not calendar years. Print the school year at the top, and change your prices in September, when everyone expects a fresh arrangement anyway.",
        },
        {
            title: "Show the block's saving as a sum",
            text: "Parents do the arithmetic quickly. Setting ten single lessons next to the block makes the saving obvious, and encourages families to fill your slots a whole term ahead.",
        },
        {
            title: "List your subjects and levels",
            text: "A price alone doesn't say whether you teach exam physics or just early reading. Name the levels, and the wrong enquiries drop off before you've spent time answering them.",
        },
    ],
    faqs: [
        {
            question: "Should older students cost more than younger ones?",
            answer: "Plenty of tutors set rates by level, since exam work needs more planning and marking. It's your choice. If you do, explain the reason in a few words so that parents of a younger child understand.",
        },
        {
            question: "How do I raise rates for families already with me?",
            answer: "Give them a term's notice, with the new list attached. Many tutors hold old rates until the end of the school year for loyal families, then move everyone over. Avoid a mid-term change.",
        },
        {
            question: "Should I put prices in a parents' group?",
            answer: "It helps, because a parent gets a straight answer without messaging you. Check the group's rules on advertising first, and share a dated picture of the sheet so that a later screenshot shows its age.",
        },
    ],
};
