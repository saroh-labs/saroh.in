import type { Combo } from "../types";

export const estimateGraphicDesigner: Combo = {
    document: "estimate",
    trade: "graphic-designer",
    reviewed: false,
    lede: "For design briefs that are still fuzzy: a page count that may grow, words not yet written, images not yet chosen. Show a best guess and say what would move it.",
    items: [
        {
            line: "Discovery",
            billedBy: "Hours, as a best guess",
            description: "Brief and research, hours",
            qty: "6",
            rate: "50",
        },
        {
            line: "Concepts",
            billedBy: "Per concept",
            description: "First concepts",
            qty: "3",
            rate: "200",
        },
        {
            line: "Page layouts",
            billedBy: "Per page, count not final",
            description: "Catalogue pages, about 24",
            qty: "24",
            rate: "40",
        },
        {
            line: "Rounds of changes",
            billedBy: "Per round, best guess",
            description: "Rounds of changes, likely",
            qty: "3",
            rate: "100",
        },
        {
            line: "Image allowance",
            billedBy: "An allowance, then actual cost",
            description: "Stock images, allowance",
            qty: "1",
            rate: "150",
        },
        {
            line: "Print set-up",
            billedBy: "A flat fee",
            description: "Print-ready files and proof check",
            qty: "1",
            rate: "120",
        },
    ],
    payment: {
        text: "No money is due until the brief is settled. Once it is, you can turn this figure into a fixed price, or bill the pages and hours as they really fall.",
        points: [
            "Nothing owed while the brief is still moving",
            "A fixed quote once content is final",
            "Image allowance billed at what was really spent",
        ],
    },
    fields: [
        {
            name: "Assumed page count",
            why: "The number you guessed at is what the figure rests on. A longer catalogue then explains itself.",
        },
        {
            name: "Who supplies words and images",
            why: "Late or missing content is what most often pushes a layout job over its figure.",
        },
        {
            name: "Rounds assumed",
            why: "Write how many rounds the figure allows, so a fourth one isn't a surprise.",
        },
    ],
    example: {
        number: "EST-0311",
        facts: [
            { label: "Project", value: "Summer catalogue" },
            { label: "Assumes", value: "24 pages, 3 rounds" },
        ],
        note: "Artwork rights are agreed in the final quote.",
        termsText:
            "This is an estimate, not a fixed price. It assumes 24 pages and 3 rounds of changes. If the page count grows we will tell you the new figure first.",
    },
    tips: [
        {
            title: "Price by the page while the count is open",
            text: "A client who hasn't finished their copy can't tell you the length. A per-page line lets the total grow in plain sight, with no need to reopen the whole figure.",
        },
        {
            title: "Name the content you're waiting for",
            text: "List the words, photos and logos the client still owes you. If they arrive late or in poor shape, you can point to this list when your hours run over.",
        },
        {
            title: "Keep image costs in an allowance",
            text: "You can't know which stock photos they'll fall in love with. A set allowance, billed at actual cost later, keeps the guess honest and stops you paying for their taste.",
        },
    ],
    faqs: [
        {
            question: "When is a design job too unclear for a fixed price?",
            answer: "When you don't yet know the length, the content or who signs off. Rebrands with a committee behind them are a good example. Estimate the first stage, finish the discovery, then offer a firm price for what's left.",
        },
        {
            question: "Should the estimate include the number of concepts?",
            answer: "Yes. Three concepts take far longer than one, and a client may picture a dozen. Stating the number on the page shapes what they expect, and it gives you a simple way to price one more direction.",
        },
        {
            question: "What if the client's committee keeps adding comments?",
            answer: "Ask for one person to collect all feedback, and write that into the estimate. If comments still come in separate waves, count each wave as a round. Tell the client when the rounds in your figure are used up.",
        },
        {
            question: "Do I estimate printing costs as well?",
            answer: "Only if you're arranging the print. Paper, finish and quantity can swing the cost a lot, so get a printer's figure and show it apart from your own fee, marked as their price and open to change.",
        },
    ],
    band: {
        title: "A loose brief, a clear number.",
        line: "Share the estimate as a link, get the go-ahead online, and turn it into a bill when the artwork is done.",
    },
};
