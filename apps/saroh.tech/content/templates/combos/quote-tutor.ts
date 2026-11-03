import type { Combo } from "../types";

export const quoteTutor: Combo = {
    document: "quote",
    trade: "tutor",
    reviewed: false,
    lede: "Offer a set course at a fixed price: how many lessons, on what day, what's covered, and the rule for a missed week, for a family or school to accept.",
    example: {
        number: "Q-0715",
        issued: "2026-08-24",
        due: "2026-09-04",
        terms: "custom",
        depositPlan: "50",
        facts: [
            { label: "Student", value: "Student name" },
            { label: "Course", value: "Autumn term, Tuesdays at 5 pm" },
        ],
        termsText:
            "Price covers the lessons listed this term. Half is due to hold the weekly slot, the rest at half term. Lessons cancelled with 24 hours' notice can be moved once.",
        note: "",
    },
    tips: [
        {
            title: "Hold a slot, and say until when",
            text: "After-school hours fill fast and can't be added to. Saying the Tuesday slot stays open until a named date gives families a reason to reply this week.",
        },
        {
            title: "Spell out the cancellation rule",
            text: "Family illness and school trips happen. A clear line on notice, make-ups and what's forfeited avoids a difficult talk with a parent you'll keep seeing every week.",
        },
        {
            title: "Quote schools per student and per term",
            text: "A head teacher comparing providers looks at cost against numbers helped. Give the group size, sessions and term dates so that your offer fits straight into their budget paperwork.",
        },
    ],
    faqs: [
        {
            question: "Should I quote per lesson or per term?",
            answer: "A term price fills your timetable and reduces no-shows, since the lessons are already paid for. Show the per-lesson amount as well, because parents will divide it anyway and like seeing the sum made open.",
        },
        {
            question:
                "What if a family wants to stop halfway through the term?",
            answer: "Set that rule before they accept. You might refund untaught lessons after a notice period, or keep them because the slot was held. Either way works so long as they read it in advance.",
        },
        {
            question:
                "Should online lessons be priced differently from home visits?",
            answer: "Show them separately if they differ. A home visit costs you travel time, while an online session doesn't. Then a family can choose on the page, and you're never asked to explain the gap afterwards.",
        },
        {
            question: "Is a group course quoted to each parent?",
            answer: "Send each one their own, with their child's name, the group size and the per-student price. Add the minimum number needed for the group to run, so a late drop-out doesn't leave you teaching at a loss.",
        },
    ],
    band: {
        title: "Slot held, term booked.",
        line: "Send the course offer, and collect the first payment through your own link. 0% fees.",
    },
};
