/**
 * Questions for a business outside India, after apps/saroh.in/content/faq.ts.
 * saroh.in's two GST questions are one tax question here, and currencies, import
 * and export are saroh.tech's own. Each answer traces to the private claims
 * ledger, and none names a plan's contents, a price or a limit.
 */
import type { FaqItem, SolutionFaqId } from "@saroh/marketing/content-types";

export type FaqId =
    | SolutionFaqId
    | "start-free"
    | "tax"
    | "pay"
    | "team"
    | "medical-notes"
    | "currencies"
    | "import"
    | "export"
    | "card"
    | "money"
    | "domain"
    | "ai-apps";

export const faqs = {
    "start-free": {
        q: "What does Start free include?",
        a: "Free gives you what you need to put your site up and start. It has limits on how much you can use. No card needed.",
    },
    tax: {
        q: "Does it work out my tax?",
        a: "No. You choose the name and the rate. On an invoice you write, add one tax line, like VAT 20%, and your tax number, and they're kept on the invoice. Invoices made from an order, a booking or a course have no tax line.",
    },
    pay: {
        q: "How do my customers pay?",
        a: "You take the money yourself, in cash, by card machine or by bank transfer, and record it in Saroh. Customers can also pay by card online, into your own account.",
    },
    team: {
        q: "Can more than one person use it?",
        a: "Not today. Saroh is for one person running their business: one sign-in and one calendar.",
    },
    "medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "You do. Allergies and access needs show on their orders, tickets, bookings and today's list, so you can take care.",
    },
    currencies: {
        q: "Which countries and currencies work?",
        a: "Set up your business in your country, in one of nine currencies: US, Canadian, Australian, New Zealand or Singapore dollars, euros, pounds, UAE dirhams or South African rand. A business in India uses saroh.in.",
    },
    import: {
        q: "Can I bring my records from another app?",
        a: "Yes, by CSV, for your products and your customers.",
    },
    export: {
        q: "Can I take my data with me?",
        a: "Yes. The owner can export your data, one CSV per table, invoices included.",
    },
    "shops-counter-online": {
        q: "Does my online shop share stock with my place?",
        a: "It can. Your website sells from one stock: your place's, or one kept for online orders. An order holds stock where it was placed, so the same last loaf is never sold twice.",
    },
    "gyms-pack-and-membership": {
        q: "Can I run courses as well as classes?",
        a: "Yes. Set how many places a class has. A course runs for several weeks: enrol people and see who's paid.",
    },
    "clinics-medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "You do. Allergies and access needs show on a patient's bookings and today's list, so you can take care.",
    },
    "salons-choose-stylist": {
        q: "Can a client book without messaging me?",
        a: "Yes. Your booking page shows your services and only the times you're free, and the client picks one.",
    },
    // Home's, from the landing board (saroh.in's, in Global's words).
    card: {
        q: "Do I need a card to start?",
        a: "No. Saroh is free to start, and you don't need a card to set up your site and bookings.",
    },
    money: {
        q: "Where does my customers' money go?",
        a: "Into your own payment account, in your name, or into your hand at the counter. Saroh never holds it.",
    },
    domain: {
        q: "Can I use my own domain?",
        a: "Your site lives at yourname.saroh.app from the first day. A domain you own comes with paid plans, which open soon.",
    },
    "ai-apps": {
        q: "Can I run it from Claude or ChatGPT?",
        a: "Yes. Connect Saroh as an AI app (it uses MCP, an open standard for AI assistants). It works as you, and nothing on your website goes live until you publish it.",
    },
} satisfies Record<FaqId, FaqItem>;

/**
 * Home's questions (`#faq`): the landing board's first (a phone shows the
 * first three, the rest under "All questions"), then the earlier ones.
 * "ai-apps" shows only while AI apps does.
 */
export const HOME_FAQ: FaqId[] = [
    "card",
    "money",
    "domain",
    "start-free",
    "currencies",
    "tax",
    "pay",
    "ai-apps",
    "team",
    "medical-notes",
    "import",
    "export",
];

/** A solution page's questions: Start free, its own, then the general ones. */
export function solutionFaq(own: SolutionFaqId): FaqId[] {
    return ["start-free", own, "tax", "pay", "team"];
}

/**
 * The general questions on a page in `trades/`, after its own. No "pay":
 * card payments online wait on a release switch (STRIPE_PAYMENTS) the code
 * can't show is on.
 */
export const TRADE_FAQ: FaqId[] = ["tax", "team"];

export const faqItems = (ids: FaqId[]): FaqItem[] => ids.map((id) => faqs[id]);
