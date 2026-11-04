import type { Combo } from "../types";

export const quotePhotographer: Combo = {
    document: "quote",
    trade: "photographer",
    reviewed: false,
    lede: "A fixed package price for a booked date: hours of coverage, images delivered, when the gallery arrives, and the deposit that holds the day.",
    items: [
        {
            line: "Package",
            billedBy: "A fixed price",
            description: "Full-day package, 10 hours",
            qty: "1",
            rate: "2000",
        },
        {
            line: "Engagement shoot",
            billedBy: "Per session",
            description: "Engagement session, 1 hour",
            qty: "1",
            rate: "300",
        },
        {
            line: "Gallery",
            billedBy: "Included, by number of images",
            description: "Online gallery, 400 images",
            qty: "1",
            rate: "0",
        },
        {
            line: "Album",
            billedBy: "Per album",
            description: "Parent albums, 20 pages",
            qty: "2",
            rate: "200",
        },
        {
            line: "Extra hours",
            billedBy: "Per hour, if chosen",
            description: "Added evening coverage, hours",
            qty: "2",
            rate: "150",
        },
        {
            line: "Overnight stay",
            billedBy: "A flat fee",
            description: "Hotel, night before",
            qty: "1",
            rate: "150",
        },
    ],
    payment: {
        text: "A quote for a dated shoot should treat the date as the thing being sold. The deposit reserves it, and the balance falls due before the day or before the gallery goes out.",
        points: [
            "A deposit holds the date on acceptance",
            "Balance due a set time before the shoot",
            "Added hours billed if the day runs over",
        ],
    },
    fields: [
        {
            name: "Date and venue",
            why: "You're promising a specific day. It should be on the page they sign.",
        },
        {
            name: "Delivery time",
            why: "Say how many weeks until the gallery, because couples start asking within days.",
        },
        {
            name: "Cancel and move rules",
            why: "Say what happens to the deposit, before they've handed it over.",
        },
    ],
    example: {
        number: "Q-0105",
        facts: [
            { label: "Shoot date", value: "12 Sep 2026" },
            { label: "Gallery in", value: "6 weeks" },
        ],
        termsText:
            "Date held once the deposit is paid. Balance is due 14 days before the shoot. Added hours are billed as agreed on the day.",
    },
    tips: [
        {
            title: "Write when the gallery arrives",
            text: "Editing takes far longer than couples imagine. A number of weeks on the quote means fewer anxious messages, and you can point to it when the first asks arrive after the honeymoon.",
        },
        {
            title: "Show what the day runs to",
            text: "Give a start and end time for your coverage, not only a number of hours. Then you won't be asked to stay for dancing because the speeches ran an hour late.",
        },
        {
            title: "Plan for you falling ill",
            text: "Say what happens if you can't attend: a named replacement, or a full refund. Couples rarely ask, but they're reassured when they read it, and it sets the limit of your promise.",
        },
    ],
    faqs: [
        {
            question:
                "A couple wants to hold the date while they decide. Can I say yes?",
            answer: "Give a short, written hold, such as five days, and say it ends without notice. Once another enquiry arrives, ask them to decide. A date is the one thing you can't sell twice, so an open-ended hold costs you real money.",
        },
        {
            question: "Should my quote list the raw files?",
            answer: "If you don't hand them over, say so plainly. Some clients assume every frame is theirs. A short line that only edited images are delivered prevents an awkward request, and explains that the edit is part of what they're buying.",
        },
        {
            question: "Can I quote a business for headshots per person?",
            answer: "Yes. A set-up fee plus a per-person amount reads better than a day rate when the staff count may change. Say how many finished images each person gets, and whether the company may use them after someone leaves.",
        },
        {
            question:
                "What if the wedding date moves after the quote is accepted?",
            answer: "Say in the quote whether the deposit carries over if you're free on the new date. If you aren't free, state what happens to the money. Writing the rule early saves a hard talk with an upset couple.",
        },
    ],
};
