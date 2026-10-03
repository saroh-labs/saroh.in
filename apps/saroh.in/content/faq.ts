/**
 * Questions, from Home's `faq` and the Solutions template's `FAQ_ALL` and
 * `FAQ_ONE` data blocks.
 *
 * Two answers differ from the designs, for the public-repo rule (no prices,
 * no plan limits in the repo): "What does Start free include?" names what
 * Free and Grow are for without amounts or limits, and "Can my team use it…"
 * drops the sentence giving Grow's team size. Both come back from the
 * catalogue when it feeds the site (U24).
 */
import type { FaqId, FaqItem } from "./types";

export const faqs = {
    "start-free": {
        q: "What does Start free include?",
        a: "The Free plan gives you a website, products and bookings to start. Move to Grow when you want to take orders, run subscriptions, send invoices or add your team. Plan details are announced at launch.",
    },
    gst: {
        q: "Does it do GST?",
        a: "Yes. Paid orders, bookings and renewals get numbered tax invoices with your GSTIN, HSN or SAC codes and the tax split. Businesses that don't charge GST, like clinics, get bills of supply instead.",
    },
    "gst-solutions": {
        q: "Does it do GST?",
        a: "Yes. Paid orders, bookings and renewals get numbered tax invoices with your GSTIN, HSN or SAC codes and the tax split. Businesses that don't charge GST get bills of supply instead.",
    },
    pay: {
        q: "How do my customers pay?",
        a: "By UPI or card on your site, or with a pay link from an invoice or reminder. Subscriptions and memberships renew by UPI Autopay or card.",
    },
    team: {
        q: "Can my team use it without seeing everything?",
        a: "Yes. Each person gets a role, and roles decide who can change prices, see money or read sensitive notes.",
    },
    "medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "Only people whose role allows sensitive notes. Allergies and access needs show wherever a customer's name appears, so the whole team knows to take care.",
    },
    hindi: {
        q: "Is my customers' site in Hindi?",
        a: "Your site works in English and Hindi, and your customers can switch between them.",
    },
    "shops-counter-online": {
        q: "Can I sell at the counter and online at once?",
        a: "Yes. Each location keeps its own stock, and an order holds stock where it was placed, so the counter and your site never sell the same last loaf.",
    },
    "gyms-pack-and-membership": {
        q: "Can members use a class pack and a membership?",
        a: "Yes. Credits from a pack are used as they book, and a membership renews on its own. Each member's page shows what they have left.",
    },
    "clinics-medical-notes": {
        q: "Who can read a patient's medical notes?",
        a: "Only people whose role allows sensitive notes, such as your dentists and the owner. Allergies and access needs show wherever a patient's name appears, so the desk still knows to take care.",
    },
} satisfies Record<FaqId, FaqItem>;

export type { FaqId };

/** Home's six questions (`#faq`), in the design's order. */
export const HOME_FAQ: FaqId[] = [
    "start-free",
    "gst",
    "pay",
    "team",
    "medical-notes",
    "hindi",
];

/** A solution page's questions: Start free, its own, then the general ones. */
export function solutionFaq(own: FaqId): FaqId[] {
    return ["start-free", own, "gst-solutions", "pay", "team", "hindi"];
}

export const faqItems = (ids: FaqId[]): FaqItem[] => ids.map((id) => faqs[id]);
