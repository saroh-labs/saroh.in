/**
 * Questions, from Home's `faq` and the Solutions template's `FAQ_ALL` and
 * `FAQ_ONE` data blocks.
 *
 * Two answers differ from the designs, for the public-repo rule (no prices,
 * no plan limits in the repo): "What does Start free include?" names no
 * plan's contents (they are set in the admin, DEC-075 D3), and "Can my team
 * use it…" drops the sentence giving Grow's team size. Both come back from
 * the catalogue when it feeds the site (U24).
 *
 * The design's "Is my customers' site in Hindi?" is gone: a business's own
 * content can't be in a second language yet (DEC-075, D13). Other answers
 * follow the claims ledger (`MARKETING_CLAIMS.md`).
 */
import type { FaqId, FaqItem } from "./types";

export const faqs = {
    "start-free": {
        q: "What does Start free include?",
        a: "Free gives you what you need to put your site up and start. Move to a paid plan when you need more.",
    },
    gst: {
        q: "Does it do GST?",
        a: "Yes. Once your GSTIN is in Settings, invoices for paid orders, bookings and renewals are numbered tax invoices with HSN or SAC codes and the tax split. GST-exempt sales, like most healthcare, go on a bill of supply.",
    },
    "gst-solutions": {
        q: "Does it do GST?",
        a: "Yes. Once your GSTIN is in Settings, invoices for paid orders, bookings and renewals are numbered tax invoices with HSN or SAC codes and the tax split. GST-exempt sales go on a bill of supply.",
    },
    pay: {
        q: "How do my customers pay?",
        a: "By UPI or card through your own Razorpay or Cashfree account: on your site, or with a pay link from an invoice or reminder. Subscriptions and memberships can renew on their own by UPI Autopay where you've set it up on your Razorpay account; otherwise each renewal is invoiced with a pay link.",
    },
    team: {
        q: "Can my team use it without seeing everything?",
        a: "Yes. Each person gets a role, and roles decide who can edit products and prices, see money or read sensitive notes.",
    },
    "medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "Only people whose role allows sensitive notes. Allergies and access needs show on their orders, tickets, bookings and today's list, so the whole team knows to take care.",
    },
    "shops-counter-online": {
        q: "Can I sell at the counter and online at once?",
        a: "Yes. Each location keeps its own stock, and an order holds stock where it was placed, so the counter and your site never sell the same last loaf.",
    },
    "gyms-pack-and-membership": {
        q: "Can members book with a membership?",
        a: "Yes. A membership pays for classes as they book, and renews on its day: on its own by UPI Autopay where you've set it up, or with an invoice and a pay link. Each member's page shows what they have left.",
    },
    "clinics-medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "Only people whose role allows sensitive notes, such as the owner and anyone you allow. Allergies and access needs show on a patient's bookings and today's list, so the desk still knows to take care.",
    },
    "salons-choose-stylist": {
        q: "Can a client choose their stylist?",
        a: "Yes. When more than one person takes a service, your booking page offers Anyone or a named person, and shows only the times that person is free. You choose who takes each service.",
    },
    // Home's, from the landing board (round 4).
    card: {
        q: "Do I need a card to start?",
        a: "No. You can set up your site and bookings for free, and add a card only when you move to a paid plan.",
    },
    money: {
        q: "Where does my customers' money go?",
        a: "Into your own Razorpay or Cashfree account, or Stripe outside India. Saroh never holds it.",
    },
    domain: {
        q: "Can I use my own domain?",
        a: "Yes. Start on yourname.saroh.app and connect your own domain when you're ready.",
    },
    "ai-apps": {
        q: "Can I run it from Claude or ChatGPT?",
        a: "Yes. Connect Saroh as an AI app (it uses MCP, an open standard for AI assistants). It works as you, and changes wait for you to publish.",
    },
} satisfies Record<FaqId, FaqItem>;

export type { FaqId };

/**
 * Home's questions (`#faq`): the landing board's first (a phone shows the
 * first three, the rest under "All questions"), then the earlier design's,
 * without its Hindi one. "ai-apps" shows only while AI apps does
 * (`homeFaq`).
 */
export const HOME_FAQ: FaqId[] = [
    "card",
    "money",
    "domain",
    "start-free",
    "gst",
    "pay",
    "ai-apps",
    "team",
    "medical-notes",
];

/** A solution page's questions: Start free, its own, then the general ones. */
export function solutionFaq(own: FaqId): FaqId[] {
    return ["start-free", own, "gst-solutions", "pay", "team"];
}

export const faqItems = (ids: FaqId[]): FaqItem[] => ids.map((id) => faqs[id]);
