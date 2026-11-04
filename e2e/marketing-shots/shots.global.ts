/**
 * saroh.tech's screenshots (global edition plan, U11): the Global demo
 * businesses from `db:seed:global`, taken by `capture.ts --edition=global`.
 * Keys are the ones saroh.tech's pages name; the `l-` keys are the salon's.
 *
 * A person looks at every image: nothing checks pixels for ₹ or GST. A screen
 * that still shows India's details, or a feature a Global business can't use
 * (working subscriptions, online payments, pay links) isn't listed here, and its
 * key stays in `apps/saroh.tech/content/shots.ts`'s PENDING_SHOTS. Nothing is
 * hidden from a shot: what's on the page is what a Free business sees, with
 * Insights (the bakery) and Courses (the gym) turned on, as Free can.
 *
 * `d-customer` isn't taken: the note card says "for the team" to one person
 * (PENDING_SHOTS). Retake it when the app's words are fixed.
 *
 * Read-only, like every shot: nothing here saves. `alt` is true to the image
 * and names the business as a demo.
 */
import { morningZone } from "../../packages/database/src/seed/global/morning-zone";
import type { Shot } from "./shots.config";
import { DESK } from "./shots.config";

export { morningZone };

const SHOP = "seed_gl_shop";
const SALON = "seed_gl_salon";
const GYM = "seed_gl_gym";
const CLINIC = "seed_gl_clinic";

/** Past a service's click the summary reads its price, not the empty "To pay". */
const bookingPage = (service: string): Partial<Shot> => ({
    viewport: { width: 1440, height: 1600 },
    steps: [{ click: `button:has-text("${service}")` }],
    clip: { selector: "div.max-w-\\[1060px\\]:has([data-step])", pad: 16 },
});
/** The week's grid: its header names a zone the capture chose (`morningZone`). */
const weekGrid: Partial<Shot> = {
    viewport: { width: 1440, height: 1100 },
    clip: { selector: "[data-week-view] >> visible=true" },
};

/**
 * The paper as it prints: the panel beside it offers a paid plan's online
 * payment and own email, which Free's page says it doesn't sell.
 */
const invoicePaper: Partial<Shot> = {
    viewport: { width: 1440, height: 1100 },
    clip: { selector: '[aria-label$="as it prints"]', pad: 8 },
};
/**
 * Home from its tiles down through Needs you, with Today beside it. It stops
 * above Finish setup, whose last step asks for bank details a foreign bank
 * can't fill in yet (the API requires an IFSC). `open` opens that many of the
 * Needs you groups, so the column reaches the bottom of Today.
 */
const homeRegion = (open = 0): Partial<Shot> => ({
    viewport: { width: 1440, height: 1200 },
    steps: Array.from({ length: open }, () => ({
        click: '[data-need-group] button[aria-label="Show the rows"]',
    })),
    clip: {
        selector: '[data-home-layout="desk"]',
        until: '[data-home-layout="desk"] section:has(h2:text-is("Needs you"))',
        pad: 4,
    },
});

const shop = (
    key: string,
    route: string,
    alt: string,
    extra: Partial<Shot> = {},
): Shot => ({
    key,
    business: "thistlewick",
    role: "owner",
    route,
    viewport: DESK,
    alt: `${alt}`,
    caption: alt,
    ...extra,
});
const salon = (
    key: string,
    route: string,
    alt: string,
    extra?: Partial<Shot>,
) => shop(key, route, alt, { business: "larkspur", ...extra });
const gym = (key: string, route: string, alt: string, extra?: Partial<Shot>) =>
    shop(key, route, alt, { business: "ironvale", ...extra });
const clinic = (
    key: string,
    route: string,
    alt: string,
    extra?: Partial<Shot>,
) => shop(key, route, alt, { business: "wrenfield", ...extra });

export const GLOBAL_SHOTS: Shot[] = [
    // ── Thistlewick Bakery ─────────────────────────────────────────────
    shop(
        "s-home",
        "/",
        "Home at Thistlewick Bakery (demo bakery): what needs doing today, most urgent first, beside today's pick-ups",
        homeRegion(),
    ),
    shop(
        "s-orders",
        "/commerce/orders",
        "The Orders list at Thistlewick Bakery (demo bakery): each order's step, how long it has waited and its total",
    ),
    shop(
        "r-order",
        `/commerce/orders/${SHOP}_order_maya`,
        "An order at Thistlewick Bakery (demo bakery): how long it has waited, a sesame allergy warning, items, customer and money",
    ),
    shop(
        "r-invoice",
        `/billing/invoices/${SHOP}_invoice_manual_cedar`,
        "An invoice written by hand at Thistlewick Bakery (demo bakery), in dollars, with a sales tax line and the business's tax number",
        invoicePaper,
    ),
    shop(
        "r-customers",
        "/commerce/customers",
        "The Customers list at Thistlewick Bakery (demo bakery): each customer with tags, last order, orders and spend",
    ),
    shop(
        "s-customer",
        `/contacts/${SHOP}_contact_maya`,
        "Maya Thompson's page at Thistlewick Bakery (demo bakery): her orders and spend, a sesame allergy and what she usually buys",
    ),
    shop(
        "s-billing",
        "/billing/invoices",
        "Invoices at Thistlewick Bakery (demo bakery): numbered, paid or due, with what's overdue flagged",
    ),
    shop(
        "r-calendar",
        "/calendar",
        "This month on the calendar at Thistlewick Bakery (demo bakery), with each day's money and a strip of totals",
    ),
    shop(
        "s-insights",
        "/analytics",
        "Insights at Thistlewick Bakery (demo bakery): what to do next, money in dollars, what sells most, then visits, visitors, enquiries and orders",
    ),
    shop(
        "i-compare",
        "/analytics?tab=from",
        "Four numbers for the site of Thistlewick Bakery (demo bakery): visits, visitors, enquiries, and paid orders and bookings",
        {
            viewport: { width: 1440, height: 1100 },
            clip: {
                selector:
                    'main section:has(h2:text-is("Your website")) > div.grid > :first-child',
                pad: 12,
            },
        },
    ),
    shop(
        "i-weeks",
        "/analytics?tab=from&period=3m",
        "Three months of visits to the site of Thistlewick Bakery (demo bakery), a bar for each day",
        {
            viewport: { width: 1440, height: 1800 },
            clip: {
                selector: 'main section:has(h3:text-is("Visits each day"))',
                pad: 8,
            },
        },
    ),
    shop(
        "i-store",
        "/analytics?tab=from",
        "The pages people open most on the site of Thistlewick Bakery (demo bakery), with their visits",
        {
            viewport: { width: 1440, height: 2000 },
            clip: {
                selector:
                    'main section:has(h3:text-is("Which pages do people open?"))',
                pad: 16,
            },
        },
    ),
    shop(
        "p-products",
        "/commerce/products",
        "The Products list at Thistlewick Bakery (demo bakery): what needs restocking at the top, then every product with status, stock and price",
    ),
    shop(
        "p-editor",
        `/commerce/products/${SHOP}_product_0/edit`,
        "The product editor at Thistlewick Bakery (demo bakery): name, link, price and category beside visibility, variants and stock",
    ),
    shop(
        "p-stock",
        "/commerce/stock",
        "Stock at Thistlewick Bakery (demo bakery): each size at Downtown and Online, with what can be sold and what's promised",
    ),
    shop(
        "p-detail",
        `/commerce/products/${SHOP}_product_0`,
        "The Sourdough loaf's page at Thistlewick Bakery (demo bakery): what can be sold now, with open orders and the website",
        // Below the page's head, whose switch reads "Team view" to one person.
        {
            viewport: { width: 1440, height: 1300 },
            clip: {
                selector: 'main :has(> :is(a,button):has-text("Overview"))',
                until: "main",
            },
        },
    ),

    // ── Larkspur & Vane ────────────────────────────────────────────────
    salon(
        "l-home",
        "/",
        "Home at Larkspur & Vane (demo salon): today's appointments and overdue invoices, in pounds",
        homeRegion(1),
    ),
    salon(
        "l-book",
        "site:/book",
        "The booking page of Larkspur & Vane (demo salon): services with prices in pounds",
        bookingPage("Cut and blow-dry"),
    ),
    salon(
        "l-team",
        "/bookings/availability",
        "Imogen Vane's hours at Larkspur & Vane (demo salon), by day of the week, with her time off and booking rules",
        {
            viewport: { width: 1440, height: 1200 },
            // From "Whose hours" down: the page's head says "each person"
            // and, on Free, a notice about a team seat.
            clip: {
                selector: 'main button:has-text("Whose hours")',
                until: 'main div[class*="_400px"]',
                pad: 8,
            },
        },
    ),
    salon(
        "l-bookings",
        "/bookings?layout=week&date={nextMonday}",
        "The week at Larkspur & Vane (demo salon): Imogen Vane's appointments, by the hour",
        weekGrid,
    ),
    salon(
        "l-order",
        `/commerce/orders/${SALON}_order_amelia`,
        "A colour correction at Larkspur & Vane (demo salon): visit 1 attended, visit 2 booked, visit 3 still to book",
    ),
    salon(
        "l-customer",
        `/contacts/${SALON}_contact_hannah`,
        "Hannah Clarke's page at Larkspur & Vane (demo salon): her next booking, who came and who didn't, and an allergy",
    ),
    salon(
        "l-invoice",
        `/billing/invoices/${SALON}_invoice_manual_bridal`,
        "An invoice written by hand at Larkspur & Vane (demo salon), in pounds, with a VAT 20% line and the business's tax number",
        invoicePaper,
    ),
    salon(
        "l-site",
        "site:/",
        "The site of Larkspur & Vane (demo salon): services with prices and how long each takes",
    ),

    // ── Ironvale Fitness ───────────────────────────────────────────────
    gym(
        "g-home",
        "/",
        "Home at Ironvale Fitness (demo gym): today's sessions and overdue invoices",
        homeRegion(),
    ),
    gym(
        "g-bookings",
        "/bookings?layout=week&date={nextMonday}",
        "The week at Ironvale Fitness (demo gym): personal training and classes with Jordan Reyes, by the hour",
        weekGrid,
    ),
    gym(
        "g-book",
        "site:/book",
        "The booking page of Ironvale Fitness (demo gym), with services, classes and a summary",
        bookingPage("Personal training"),
    ),
    gym(
        "g-courses",
        "/courses",
        "Courses at Ironvale Fitness (demo gym): a four-week strength course with the places taken",
    ),
    gym(
        "g-customer",
        `/contacts/${GYM}_contact_alex`,
        "Alex Romero's page at Ironvale Fitness (demo gym): the next booking, who came and who didn't, and an old injury flagged on the page",
    ),
    gym(
        "g-billing",
        "/billing/invoices",
        "Invoices at Ironvale Fitness (demo gym), with the overdue ones flagged",
    ),
    gym(
        "g-site",
        "site:/",
        "The site of Ironvale Fitness (demo gym): what's on today and Book a free trial",
    ),

    // ── Wrenfield Dental ───────────────────────────────────────────────
    clinic(
        "d-home",
        "/",
        "Home at Wrenfield Dental (demo clinic): today's patients, overdue invoices and a patient's note from the booking page",
        homeRegion(1),
    ),
    clinic(
        "d-order",
        `/commerce/orders/${CLINIC}_order_daniel`,
        "A root canal at Wrenfield Dental (demo clinic): visit 1 attended, visit 2 booked, visit 3 still to book",
    ),
    clinic(
        "d-customers",
        "/commerce/customers",
        "The Customers list at Wrenfield Dental (demo clinic): patients with medical and allergy tags, last order and spend",
    ),
    clinic(
        "d-book",
        "site:/book",
        "The booking page of Wrenfield Dental (demo clinic), with check-ups, a root canal over three visits and a video consultation",
        bookingPage("Check-up and clean"),
    ),
    clinic(
        "d-billing",
        "/billing/invoices",
        "Invoices at Wrenfield Dental (demo clinic), with the overdue ones flagged",
    ),
    clinic(
        "d-site",
        "site:/",
        "The site of Wrenfield Dental (demo clinic): free times today and Book an appointment",
    ),
];
