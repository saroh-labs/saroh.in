/**
 * The screenshot manifest (plan U20, KTD-11): one entry per shot key the
 * designs use. The capture pipeline (U20) shoots each from the real app and
 * writes `shots.captured.ts`; until a key is captured `src` is null and
 * `<ScreenshotFrame>` draws a neutral frame of the same shape, so a page's
 * layout already matches the design.
 *
 * `alt` is the shot's caption everywhere it is shown: feature steps and
 * solution segments carry none of their own, so a page never describes what
 * the design drew instead of what the image shows (claims ledger §9). Each
 * names its business as a demo (DEC-075, D14). No amounts in captions: the
 * shot shows the figures, the caption says what it is.
 */
import type { ShotKey } from "@saroh/marketing/content-types";
import type { Shot } from "@saroh/marketing/shot";

import { CAPTURED } from "./shots.captured";

export type { Shot, ShotKey };

const pending = (alt: string): Shot => ({
    src: null,
    alt,
    width: 1600,
    height: 1000,
});

const designed = {
    "s-home": pending(
        "Home at Rye & Co. (demo bakery): what needs doing today, from late orders to a failed renewal",
    ),
    "s-orders": pending(
        "The Orders list at Rye & Co. (demo bakery): each order's step, how long it has waited, when it was placed and its total",
    ),
    "r-order": pending(
        "An order at Rye & Co. (demo bakery): how long it has waited, a sesame allergy warning, items, customer and money",
    ),
    "d-order": pending(
        "A root canal at Kavi Dental (demo clinic): visit 1 attended, visit 2 booked, visit 3 still to book",
    ),
    "r-invoice": pending(
        "A GST tax invoice from Rye & Co. (demo bakery) to a café, with the business's details and tax",
    ),
    "r-customers": pending(
        "The Customers list: each customer with tags, last order, orders and spend",
    ),
    "s-customer": pending(
        "Priya Raman's page: her orders and spend, a sesame allergy and what she usually buys",
    ),
    "g-customer": pending(
        "Asha Verma's page at Pulse Fitness (demo gym): classes left on her membership and her next booking",
    ),
    "d-customer": pending(
        "Rahul Verma's page with a note from the booking page about a new blood-pressure tablet",
    ),
    "d-customers": pending(
        "Patients at Kavi Dental (demo clinic), with medical and allergy tags",
    ),
    "g-bookings": pending(
        "The week at Pulse Fitness (demo gym): personal training and classes, by the hour",
    ),
    "g-book": pending(
        "The booking page of Pulse Fitness (demo gym), with services, classes and a summary",
    ),
    "g-courses": pending(
        "Courses at Pulse Fitness (demo gym): a four-week strength course with the places taken",
    ),
    "g-packs": pending(
        "Class packs: 5 and 10 classes with how many are sold and still to use",
    ),
    "d-book": pending(
        "The booking page of Kavi Dental (demo clinic), with check-ups, a root canal over three visits and a video consult",
    ),
    "r-subdetail": pending(
        "Priya Raman's weekly loaf: next charge, upcoming collections, plan and changes",
    ),
    "g-site": pending(
        "The site of Pulse Fitness (demo gym): what's on today and Book a free trial",
    ),
    "s-subs": pending(
        "Subscriptions at Rye & Co. (demo bakery) with one failed renewal flagged",
    ),
    "s-billing": pending(
        "Invoices at Rye & Co. (demo bakery): each order's GST invoice, paid or due, with what's overdue flagged",
    ),
    "d-billing": pending(
        "Bills of supply at Kavi Dental (demo clinic), with the overdue ones flagged",
    ),
    "g-billing": pending(
        "Invoices at Pulse Fitness (demo gym), with the overdue ones flagged",
    ),
    "s-insights": pending(
        "Insights: site views, visitors, enquiries and orders over the last 30 days, with views by day and top pages",
    ),
    "i-compare": pending(
        "Insights for 30 days: site views, unique visitors, enquiries and orders, views by day and the most-viewed pages",
    ),
    "i-weeks": pending("Ninety days of site views, a bar for each day"),
    "i-store": pending(
        "Insights for the last seven days: site views, enquiries, orders and the most-viewed pages",
    ),
    "p-products": pending(
        "The Products list at Rye & Co. (demo bakery): what needs restocking at the top, then every product with status, stock and price",
    ),
    "p-editor": pending(
        "The product editor: name, link, price and category beside visibility, variants and stock",
    ),
    "p-site": pending(
        "The shop page of Rye & Co. (demo bakery) for the Sourdough loaf: sizes, price and Add to basket",
    ),
    "p-stock": pending(
        "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
    ),
    "p-detail": pending(
        "Sourdough loaf's page: what can be sold now, with open orders, discounts, collections, the website and reviews",
    ),
    "d-home": pending(
        "Home at Kavi Dental (demo clinic): a patient's note from the booking page, overdue bills and the week so far",
    ),
    "g-home": pending(
        "Home at Pulse Fitness (demo gym): overdue memberships, follow-ups and this week's takings",
    ),
    "r-calendar": pending(
        "This month on the calendar with each day's money and a strip of totals",
    ),
    "d-site": pending(
        "The site of Kavi Dental (demo clinic): free times today and Book an appointment",
    ),
    "g-subs": pending(
        "Memberships at Pulse Fitness (demo gym) with their next charge",
    ),
    // AI apps, Ask AI and Share (plan 2026-11-13-002): placeholders until
    // captured. Share's and AI apps' Saroh screens (consent, AI activity)
    // have specs in `e2e/marketing-shots/shots.config.ts`; AI apps' hero and
    // `ai-ask` are another company's chat, drawn on the page instead;
    // Ask AI's wait for its screens (plan 2026-11-13-001), and the release
    // check refuses its switch while any is a placeholder. Not built while
    // their switch is off. The demo salon is the seed's Gulmohar.
    "ai-hero": pending(
        "An AI assistant adding a section to the home page of Rye & Co. (demo bakery) as a draft",
    ),
    "ai-connect": pending(
        "An AI app's Add a connector form with Saroh's address",
    ),
    "ai-consent": pending(
        "Saroh's sign-in for an AI app at Rye & Co. (demo bakery): the businesses it may use, and what it may and may not do",
    ),
    "ai-ask": pending(
        "An AI assistant moving a booking at Gulmohar Salon & Bridal (demo salon)",
    ),
    "ai-activity": pending(
        "Settings at Rye & Co. (demo bakery): a connected AI app and the changes it made",
    ),
    "ask-hero": pending(
        "Ask AI at Gulmohar Salon & Bridal (demo salon) answering how the week went",
    ),
    "ask-start": pending(
        "Ask AI at Pulse Fitness (demo gym) before a question, with ready questions",
    ),
    "ask-answer": pending(
        "Ask AI at Rye & Co. (demo bakery) answering a question in Hinglish",
    ),
    "ask-confirm": pending(
        "Ask AI at Gulmohar Salon & Bridal (demo salon): a new service card to check before it is added",
    ),
    "ask-history": pending(
        "Ask AI's history at Gulmohar Salon & Bridal (demo salon)",
    ),
    "sh-sheet": pending(
        "The Share sheet for a product at Rye & Co. (demo bakery): a card in the bakery's look, its sizes and caption",
    ),
    "sh-button": pending(
        "A live product at Rye & Co. (demo bakery) with its Share button",
    ),
    "sh-cards": pending(
        "Card styles for a service at Gulmohar Salon & Bridal (demo salon) in the salon's own colours",
    ),
    "sh-phone": pending(
        "The Share sheet on a phone for a class at Pulse Fitness (demo gym), with Share now",
    ),
    "sh-post": pending(
        "Create post at Rye & Co. (demo bakery): a headline, a link and the card drawn in the bakery's look",
    ),
} satisfies Record<string, Shot>;

/** A captured shot (U20) replaces its placeholder, alt included: the
 * captured alt describes what the image really shows. */
export const shots = Object.fromEntries(
    Object.entries(designed).map(([key, shot]) => [key, CAPTURED[key] ?? shot]),
) as Record<ShotKey, Shot>;

export const SHOT_KEYS = Object.keys(shots) as ShotKey[];
