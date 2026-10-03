/**
 * The screenshot manifest (plan U20, KTD-11): one entry per shot key the
 * designs use. The capture pipeline (U20) shoots each from the real app and
 * fills `src`, `width` and `height`; until then `src` is null and
 * `<ScreenshotFrame>` draws a neutral frame of the same shape, so a page's
 * layout already matches the design.
 *
 * `alt` is the shot's default caption. Where a page shows a shot with its own
 * caption (a feature step, a solution segment), the content carries that alt.
 * No amounts in captions: the shot shows the figures, the caption says what
 * it is.
 */
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

export const shots = {
    "s-home": pending(
        "The Saroh dashboard at Rye & Co.: late orders, a failed renewal and what's due today, most urgent first",
    ),
    "s-orders": pending(
        "The Orders list at Rye & Co.: each order's step, how long it has waited, when it was placed and its total",
    ),
    "r-order": pending(
        "Order #1020: waiting 16 minutes, a sesame allergy warning, items, customer and money",
    ),
    "d-order": pending(
        "Order #D301, a root canal: visit 1 attended, visit 2 today, visit 3 still to book",
    ),
    "r-invoice": pending(
        "A GST invoice made from an order, with the business's details and tax",
    ),
    "r-customers": pending(
        "The Customers list: each customer with tags, last order, orders and spend",
    ),
    "s-customer": pending(
        "Priya Raman's page: six orders, what she has spent, a sesame allergy and what she usually buys",
    ),
    "g-customer": pending(
        "Farah Khan's page at Pulse: a six-week course, classes left and her next booking",
    ),
    "d-customer": pending(
        "Rahul Verma's page with a note from the booking page about a new blood-pressure tablet",
    ),
    "d-customers": pending(
        "Kavi Dental's patients with medical and allergy tags",
    ),
    "g-bookings": pending(
        "Pulse Fitness's week: personal training and classes for each trainer, by the hour",
    ),
    "g-book": pending(
        "Pulse Fitness's booking page with services, courses and a summary",
    ),
    "g-courses": pending(
        "Courses at Pulse: a six-week beginners' course and a 5K course with places filled",
    ),
    "g-packs": pending(
        "Class packs: 5 and 10 classes with how many are sold and still to use",
    ),
    "d-book": pending(
        "Kavi Dental's booking page with check-ups, a root canal over three visits and a video consult",
    ),
    "r-subdetail": pending(
        "Priya Raman's weekly loaf: next charge, upcoming collections, plan and changes",
    ),
    "g-site": pending(
        "Pulse Fitness's site with classes today and a link to memberships",
    ),
    "s-subs": pending(
        "Subscriptions at Rye & Co. with one failed renewal flagged",
    ),
    "s-billing": pending(
        "Invoices at Rye & Co.: each order's GST invoice, paid or due, with a bulk order in draft",
    ),
    "d-billing": pending("Kavi Dental's bills of supply with one overdue"),
    "g-billing": pending("Pulse Fitness's invoices with four overdue"),
    "s-insights": pending(
        "Insights at Rye & Co.: four weeks of takings, twelve weeks of bars, and Hill Road against Online",
    ),
    "i-compare": pending(
        "Insights at Rye & Co.: takings, orders, best week and average order for four weeks",
    ),
    "i-weeks": pending(
        "Twelve weeks of takings, from 7 Jul to 22 Sep, with 15 Sep marked as the best week",
    ),
    "i-store": pending(
        "Insights for Hill Road only: its takings and orders in four weeks",
    ),
    "p-products": pending(
        "The Products list at Rye & Co.: what needs restocking at the top, then every product with status, stock and price",
    ),
    "p-editor": pending(
        "The product editor: name, address on the shop, price and category beside visibility, variants and stock",
    ),
    "p-site": pending(
        "Rye & Co.'s shop page showing each product with its sizes, price and an Add to bag button",
    ),
    "p-stock": pending(
        "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
    ),
    "p-detail": pending(
        "Sourdough loaf's page: 25 can be sold now, with open orders, discounts, collections, pages and reviews",
    ),
    "d-home": pending(
        "Kavi Dental's Home: today's patients with their dentist, chair and flags",
    ),
    "g-home": pending(
        "Pulse Fitness's Home: overdue memberships, a failed renewal and today's sessions",
    ),
    "r-calendar": pending(
        "September on the calendar with each day's money and a strip of totals",
    ),
    "d-site": pending(
        "Kavi Dental's own site on Saroh: free times today and Book an appointment",
    ),
    "g-subs": pending("Memberships at Pulse with their next charge"),
} satisfies Record<string, Shot>;

export type ShotKey = keyof typeof shots;

export const SHOT_KEYS = Object.keys(shots) as ShotKey[];
