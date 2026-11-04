import type { Combo } from "../types";

export const estimateTutor: Combo = {
    document: "estimate",
    trade: "tutor",
    reviewed: false,
    lede: "Show a family what exam preparation could cost before a first assessment: likely weekly lessons, the weeks left and papers to mark, all marked as a rough plan.",
    items: [
        {
            line: "First assessment",
            billedBy: "Per session",
            description: "First assessment and learning plan",
            qty: "1",
            rate: "40",
        },
        {
            line: "Weekly lessons",
            billedBy: "Estimated hours to the exam",
            description: "Weekly lessons, estimated hours",
            qty: "24",
            rate: "40",
        },
        {
            line: "Holiday revision",
            billedBy: "Per intensive day",
            description: "Holiday revision days, if needed",
            qty: "2",
            rate: "150",
        },
        {
            line: "Mock papers",
            billedBy: "Per paper, set and marked",
            description: "Mock papers set and marked",
            qty: "6",
            rate: "15",
        },
        {
            line: "Progress reports",
            billedBy: "Per written report",
            description: "Written reports to parents",
            qty: "3",
            rate: "20",
        },
        {
            line: "Study materials",
            billedBy: "Per set",
            description: "Revision guide and past papers",
            qty: "1",
            rate: "30",
        },
    ],
    example: {
        number: "EST-0715",
        issued: "2026-09-07",
        due: "2026-09-21",
        terms: "custom",
        facts: [
            { label: "Student", value: "Student name" },
            { label: "Goal", value: "Maths exam, next June" },
        ],
        termsText:
            "A rough plan, not a promised result. The number of lessons may change after the first assessment. Lessons are billed as they are taught.",
        note: "",
    },
    tips: [
        {
            title: "Count the weeks to the exam",
            text: "Parents think in terms of an hourly cost and forget how long the road is. Multiplying weekly lessons by the weeks remaining gives them a true figure to budget against.",
        },
        {
            title: "Never promise a grade",
            text: "Write what you will teach and how often, not what the student will score. Your figure is for your time, and results depend on far more than one tutor.",
        },
        {
            title: "Price the intensive days as optional",
            text: "Holiday revision depends on how the mock goes. Marking those days as if needed lets the family see the worst case, without feeling they've already committed to spending it.",
        },
    ],
    faqs: [
        {
            question:
                "How many lessons should I estimate for a student I've not met?",
            answer: "Give a likely range from the time left and their current level as described by the parent. Then run a first assessment, and revise your plan. A figure made blind should always say so plainly.",
        },
        {
            question: "Should the first assessment be free?",
            answer: "That's your call. A paid one signals that the session has real value and produces a plan they can keep. A free chat works for meeting them, though it shouldn't include marking a whole paper.",
        },
        {
            question:
                "What if the student needs fewer lessons than I estimated?",
            answer: "Good news for everyone. Bill only what you teach, and tell the family early. Being honest here earns referrals to other parents at the school, which is worth more than the few extra hours.",
        },
    ],
};
