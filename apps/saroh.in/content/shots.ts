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
import { CAPTURED } from "./shots.captured";

export interface Shot {
    /** Under /public, e.g. `/shots/v2/s-home.webp`; null until captured. */
    src: string | null;
    alt: string;
    /** Intrinsic size of the captured image; the placeholder uses 16:10. */
    width: number;
    height: number;
}

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
} satisfies Record<string, Shot>;

/** A captured shot (U20) replaces its placeholder, alt included: the
 * captured alt describes what the image really shows. */
export const shots = Object.fromEntries(
    Object.entries(designed).map(([key, shot]) => [key, CAPTURED[key] ?? shot]),
) as Record<keyof typeof designed, Shot>;

export type ShotKey = keyof typeof designed;

export const SHOT_KEYS = Object.keys(shots) as ShotKey[];
