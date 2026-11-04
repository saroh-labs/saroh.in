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
    | "export";

export const faqs = {
    "start-free": {
        q: "What does Start free include?",
        a: "Free gives you what you need to put your site up and start. No card needed.",
    },
    tax: {
        q: "Does it work out my tax?",
        a: "No. You choose the name and the rate. On an invoice you write, add one tax line, like VAT 20%, and your tax number, and they're kept on the invoice. Invoices made from an order, a booking or a course have no tax line.",
    },
    pay: {
        q: "How do my customers pay?",
        a: "You take the money yourself, in cash, by card machine or by bank transfer, and record it in Saroh. Paying online isn't available yet.",
    },
    team: {
        q: "Can my team use it without seeing everything?",
        a: "Yes. Each person gets a role, and roles decide who can edit products and prices, see money or read sensitive notes.",
    },
    "medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "Only people whose role allows sensitive notes. Allergies and access needs show on their orders, tickets, bookings and today's list, so the whole team knows to take care.",
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
        q: "Does each location keep its own stock?",
        a: "Yes. Each location keeps its own stock, and an order holds stock where it was placed, so two people never sell the same last loaf.",
    },
    "gyms-pack-and-membership": {
        q: "Can I run courses as well as classes?",
        a: "Yes. Set how many places a class has. A course runs for several weeks: enrol people and see who's paid.",
    },
    "clinics-medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "Only people whose role allows sensitive notes, such as the owner and anyone you allow. Allergies and access needs show on a patient's bookings and today's list, so the desk still knows to take care.",
    },
    "salons-choose-stylist": {
        q: "Can a client choose their stylist?",
        a: "Yes. When more than one person takes a service, your booking page offers Anyone or a named person, and shows only the times that person is free. You choose who takes each service.",
    },
} satisfies Record<FaqId, FaqItem>;

/** Home's questions (`#faq`). */
export const HOME_FAQ: FaqId[] = [
    "start-free",
    "currencies",
    "tax",
    "pay",
    "team",
    "medical-notes",
    "import",
    "export",
];

/** A solution page's questions: Start free, its own, then the general ones. */
export function solutionFaq(own: SolutionFaqId): FaqId[] {
    return ["start-free", own, "tax", "pay", "team"];
}

export const faqItems = (ids: FaqId[]): FaqItem[] => ids.map((id) => faqs[id]);
