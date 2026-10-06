/**
 * The marketing site's product screenshots (plan U20, KTD-11): one entry per
 * shot key the Marketing Site V2 designs use. `capture.ts` signs in to the
 * local showcase stack, opens each view and writes
 * `apps/saroh.in/public/shots/v2/<key>.webp` and the manifest
 * `apps/saroh.in/content/shots.ts`.
 *
 * The key's prefix names the demo business, read from the designs' "who"
 * lines and alt text:
 *   s-, r-, p-, i-  Rye & Co. (the bakery: shops)  — s = shops page, r = Rye
 *                   feature steps, p = products, i = insights
 *   g-              Pulse Fitness (gyms)
 *   d-              Kavi Dental (clinics)
 * except the four Insights shots, which come from Northwind: the Insights the
 * designs draw (takings, best week, location against location) is not built,
 * and Northwind is the only demo business with Insights turned on that has
 * data in it (see `gap`).
 *
 * `caption` keeps the design's words, with its money amounts left out (the
 * repo carries no amounts), for the claims ledger. `alt` says what the image
 * really shows, and names each demo business as a demo (DEC-075, D14): it is
 * the caption every page shows.
 *
 * Read-only: every step here only navigates, scrolls, flips a view that keeps
 * its state in the page, or hides a notice with CSS. Nothing is saved, and no
 * notice is dismissed (dismissing one writes). Never add a step that clicks a
 * button which saves.
 */

/** A demo business in the showcase seed (`db:seed:showcase`). */
export const BUSINESSES = {
    rye: { id: "seed_sc_rc_org", name: "Rye & Co.", site: "rye-and-co" },
    pulse: {
        id: "seed_sc_pulse_org",
        name: "Pulse Fitness",
        site: "pulse-fitness",
    },
    kavi: { id: "seed_sc_kavi_org", name: "Kavi Dental", site: "kavi-dental" },
    northwind: {
        id: "seed_org",
        name: "Northwind Supply",
        site: "northwind-supply",
    },
} as const;

export type Business = keyof typeof BUSINESSES;

/** Who signs in. All shots are taken as the demo owner. */
export const ROLES = {
    owner: "demo@saroh.dev",
} as const;

export type Role = keyof typeof ROLES;

/** The width and height the page is laid out at, in CSS pixels. */
export interface Viewport {
    width: number;
    height: number;
}

export const DESK: Viewport = { width: 1440, height: 900 };

/** A UI state set before the shot. None of these may save anything. */
export type Step =
    /** Hide whatever matches, with CSS (a notice whose dismiss would write). */
    | { hide: string }
    /** Click something that only changes the page's own state. */
    | { click: string }
    /** Wait for something to be on screen. */
    | { waitFor: string }
    /**
     * Type into a field, as a person filling a form would. Only on a form
     * that is never submitted (the shot is taken before its button).
     */
    | { fill: string; value: string };

/**
 * What part of the page is kept. Omitted: the viewport. `selector`: the box
 * of the last element it matches (the innermost, when matches nest), widened
 * by `pad` CSS pixels. It must end inside the viewport.
 */
export type Clip = {
    selector: string;
    pad?: number;
    /**
     * Run the clip on down to the bottom of this element too: two sections
     * one under the other, when their column runs on far past them.
     */
    until?: string;
};

export interface Shot {
    key: string;
    business: Business;
    role: Role;
    /**
     * A workspace path (`/commerce/orders`), or `site:<path>` for the
     * business's own site on the renderer. `{nextMonday}` is replaced with
     * the coming Monday (YYYY-MM-DD), since the seed moves with the calendar.
     */
    route: string;
    viewport: Viewport;
    steps?: Step[];
    clip?: Clip;
    /** Alt text: what the image shows, the business named as a demo. */
    alt: string;
    /** The design's caption or who-line for the shot, for the claims ledger. */
    caption: string;
    /** Where the real app cannot show what the caption says (U28 rewording). */
    gap?: string;
    /**
     * Help shots only: the control the article's step names. Its box (the
     * last match, widened by 6px) is written to the manifest as `mark`, in
     * fractions of the image, and the article draws a Saffron ring there.
     * The image itself stays clean.
     */
    mark?: string;
}

/** Notices that would only be put away by a write. */
const LATE_RULE_NOTICE: Step = {
    hide: '[role="note"]:has-text("count as late")',
};

/* ── Help articles (Resources plan U5) ─────────────────────────────────
 *
 * One shot per step, keyed `help-<article>-<step>`, written to
 * `apps/saroh.in/public/shots/help/`. Taken at the size the article shows
 * them (a 680px column, so a clip of about 700–1000 CSS px reads at close
 * to its real size), light, at 2×. Each step's `caption` in the article's
 * MDX says what the picture shows; `alt` here is the same.
 *
 * Read-only like every shot here: the forms are filled but never created
 * or saved, and Rye & Co. is only looked at. `content/help/README.md` says
 * how to add an article's shots.
 */

/** The workspace at a desk, for a whole-screen help shot. */
const HELP_DESK: Viewport = { width: 1024, height: 560 };

/** The form an "Add your first product" shot fills, never created. */
const NEW_LOAF: Step[] = [
    { waitFor: "#pe-name" },
    { fill: "#pe-name", value: "Walnut and raisin loaf" },
    { fill: "#pe-price", value: "260" },
    // Out of the field, so no focus ring is in the picture.
    { click: '[aria-labelledby="sec-basics"] h2' },
];

const RYE_NEW = "/commerce/products/new?storefront=seed_sc_rc_store";
const RYE_SOURDOUGH =
    "/commerce/products/seed_sc_rc_product_0/edit?storefront=seed_sc_rc_store";

const HELP_SHOTS: Shot[] = [
    {
        key: "help-add-product-1",
        business: "rye",
        role: "owner",
        route: "/commerce/products",
        viewport: HELP_DESK,
        steps: [
            { click: 'main button:has-text("New product")' },
            { waitFor: '[role="menu"]' },
        ],
        mark: 'main button:has-text("New product")',
        alt: "Products at Rye & Co. (demo bakery), with New product open on its two locations, Online and Hill Road",
        caption: "Products at Rye & Co., New product open on its locations",
    },
    {
        key: "help-add-product-2",
        business: "rye",
        role: "owner",
        route: RYE_NEW,
        viewport: { width: 1280, height: 1000 },
        steps: NEW_LOAF,
        clip: { selector: 'section[aria-labelledby="sec-basics"]', pad: 12 },
        mark: '[aria-labelledby="sec-basics"] :text-is("/products/") >> xpath=..',
        alt: "Basics for a new product at Rye & Co. (demo bakery): the name, the address on the shop made from it, the price and the category",
        caption:
            "Basics for a new loaf: the name, its address on the shop, the price",
    },
    {
        key: "help-add-product-3",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH,
        viewport: { width: 1280, height: 3200 },
        clip: { selector: 'section[aria-labelledby="sec-photos"]', pad: 12 },
        mark: '[aria-labelledby="sec-photos"] :text-is("Cover") >> nth=0',
        alt: "Photos and videos for the Sourdough loaf at Rye & Co. (demo bakery): two photos, the first marked Cover, each with what it shows",
        caption: "The Sourdough loaf's photos: the first is the cover",
    },
    {
        key: "help-add-product-4",
        business: "rye",
        role: "owner",
        route: RYE_NEW,
        viewport: HELP_DESK,
        steps: NEW_LOAF,
        mark: 'button:has-text("Create draft")',
        alt: "A new product at Rye & Co. (demo bakery) with a name and a price, Visibility set to Draft and the Create draft button",
        caption: "Visibility set to Draft, and Create draft at the top right",
    },
    {
        key: "help-add-product-5",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH,
        viewport: { width: 1280, height: 1200 },
        clip: {
            selector: 'section[aria-labelledby="sec-variants"]',
            until: 'section[aria-labelledby="sec-stock"]',
            pad: 12,
        },
        mark: '[aria-labelledby="sec-stock"] [role="switch"]',
        alt: "Variants and Stock for the Sourdough loaf at Rye & Co. (demo bakery): 800g and 400g with their own SKU and price, and Track stock on with On hand and Warn at for each",
        caption: "The Sourdough loaf's sizes and stock, with Track stock on",
    },
];

export const SHOTS: Shot[] = [
    // ── Rye & Co. ──────────────────────────────────────────────────────
    {
        key: "s-home",
        business: "rye",
        role: "owner",
        route: "/",
        viewport: DESK,
        alt: "Home at Rye & Co. (demo bakery): what needs doing today, from late orders to a failed renewal",
        caption:
            "Home at Rye & Co.: nine things that need Priya, from late orders to a failed renewal",
        gap: 'The owner is "Demo", not Priya, and the list holds 16 things, not nine.',
    },
    {
        key: "s-orders",
        business: "rye",
        role: "owner",
        route: "/commerce/orders",
        viewport: DESK,
        steps: [LATE_RULE_NOTICE],
        alt: "The Orders list at Rye & Co. (demo bakery): each order's step, how long it has waited, when it was placed and its total",
        caption:
            "The Orders list at Rye & Co.: each order's step, how long it has waited, when it was placed and its total",
    },
    {
        key: "r-order",
        business: "rye",
        role: "owner",
        // Order #1074: Priya Raman's, placed today, a loaf that may contain sesame.
        route: "/commerce/orders/seed_sc_rc_order_73",
        viewport: DESK,
        alt: "An order at Rye & Co. (demo bakery): how long it has waited, a sesame allergy warning, items, customer and money",
        caption:
            "Order #1020: waiting 16 minutes, a sesame allergy warning, items, customer and money",
        gap: "The seed's allergy order is #1074 and it has waited hours, not 16 minutes; #1020 is an old, collected order.",
    },
    {
        key: "r-invoice",
        business: "rye",
        role: "owner",
        // RC/26-27/0087, written by hand to Kiln & Co. Café.
        route: "/billing/invoices/seed_sc_rc_invoice_trade_3",
        viewport: DESK,
        alt: "A GST tax invoice from Rye & Co. (demo bakery) to a café, with the business's details and tax",
        caption:
            "A GST invoice made from an order, with the business's details and tax / A GST tax invoice from Rye & Co. to Third Wave Café",
        gap: "No café is called Third Wave Café in the seed (this is Kiln & Co. Café), and this invoice was written by hand, not made from an order.",
    },
    {
        key: "r-customers",
        business: "rye",
        role: "owner",
        route: "/commerce/customers",
        viewport: DESK,
        alt: "The Customers list: each customer with tags, last order, orders and spend",
        caption:
            "The Customers list: each customer with tags, last order, orders and spend",
    },
    {
        key: "s-customer",
        business: "rye",
        role: "owner",
        route: "/customers/seed_sc_rc_contact_priya",
        viewport: DESK,
        alt: "Priya Raman's page: her orders and spend, a sesame allergy and what she usually buys",
        caption:
            "Priya Raman's page: six orders, what she has spent (an amount), a sesame allergy and what she usually buys",
        gap: "The seed gives Priya 10 orders, not six, and a different total spent.",
    },
    {
        key: "r-subdetail",
        business: "rye",
        role: "owner",
        route: "/billing/subscriptions/seed_sc_rc_sub_priya",
        viewport: DESK,
        alt: "Priya Raman's weekly loaf: next charge, upcoming collections, plan and changes",
        caption:
            "Priya Raman's weekly loaf: next charge, upcoming collections, plan and changes",
    },
    {
        key: "s-subs",
        business: "rye",
        role: "owner",
        route: "/billing/subscriptions",
        viewport: DESK,
        alt: "Subscriptions at Rye & Co. (demo bakery) with one failed renewal flagged",
        caption: "Subscriptions at Rye & Co. with one failed renewal flagged",
    },
    {
        key: "s-billing",
        business: "rye",
        role: "owner",
        route: "/billing/invoices",
        viewport: DESK,
        alt: "Invoices at Rye & Co. (demo bakery): each order's GST invoice, paid or due, with what's overdue flagged",
        caption:
            "Invoices at Rye & Co.: each order's GST invoice, paid or due, with a bulk order in draft",
        gap: "The café's draft sits further down the list; the first screen shows today's paid order invoices and the overdue banner.",
    },
    {
        key: "r-calendar",
        business: "rye",
        role: "owner",
        route: "/calendar",
        viewport: DESK,
        alt: "This month on the calendar with each day's money and a strip of totals",
        caption:
            "September on the calendar with each day's money and a strip of totals",
        gap: "The calendar opens on the current month (October when captured), not September.",
    },
    {
        key: "p-products",
        business: "rye",
        role: "owner",
        route: "/commerce/products",
        viewport: DESK,
        alt: "The Products list at Rye & Co. (demo bakery): what needs restocking at the top, then every product with status, stock and price",
        caption:
            "The Products list at Rye & Co.: what needs restocking at the top, then every product with status, stock and price",
    },
    {
        key: "p-editor",
        business: "rye",
        role: "owner",
        route: "/commerce/products/seed_sc_rc_product_0/edit",
        viewport: DESK,
        alt: "The product editor: name, link, price and category beside visibility, variants and stock",
        caption:
            "The product editor: name, address on the shop, price and category beside visibility, variants and stock",
    },
    {
        key: "p-site",
        business: "rye",
        role: "owner",
        // Rye's website does not list its products yet ("Not on the website"),
        // so this is the product's shop page as a customer sees it, from the
        // workspace's Customer view, with the team's notes switched off.
        route: "/commerce/products/seed_sc_rc_product_0?view=customer",
        viewport: { width: 1440, height: 1600 },
        steps: [{ click: '[role="switch"]:has-text("Team notes")' }],
        clip: { selector: "div.overflow-hidden.rounded-xl.border.shadow-sm" },
        alt: "The shop page of Rye & Co. (demo bakery) for the Sourdough loaf: sizes, price and Add to basket",
        caption:
            "Rye & Co.'s shop page showing each product with its sizes, price and an Add to bag button / Rye & Co.'s own shop, built on Saroh: products with sizes, prices and Add to bag",
        gap: "Rye's website has no shop yet, so this is one product's shop page (the Customer view), not a list of products; the button reads \"Add to basket\".",
    },
    {
        key: "p-stock",
        business: "rye",
        role: "owner",
        route: "/commerce/stock",
        viewport: DESK,
        alt: "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
        caption:
            "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
    },
    {
        key: "p-detail",
        business: "rye",
        role: "owner",
        route: "/commerce/products/seed_sc_rc_product_0",
        viewport: DESK,
        alt: "Sourdough loaf's page: what can be sold now, with open orders, discounts, collections, the website and reviews",
        caption:
            "Sourdough loaf's page: 25 can be sold now, with open orders, discounts, collections, pages and reviews",
        gap: 'The count moves with the seed\'s orders (27 when captured), and the card reads "Website", not "pages".',
    },

    // ── Insights (Northwind) ───────────────────────────────────────────
    {
        key: "s-insights",
        business: "northwind",
        role: "owner",
        route: "/analytics",
        viewport: DESK,
        alt: "Insights: site views, visitors, enquiries and orders over the last 30 days, with views by day and top pages",
        caption:
            "Insights at Rye & Co.: four weeks' takings (an amount), twelve weeks of takings, and Hill Road against Online",
        gap: "Insights as designed (takings, best week, one location against another) is not built; today's Insights shows site views, visitors, enquiries and orders. Rye has Insights off, so this is Northwind.",
    },
    {
        key: "i-compare",
        business: "northwind",
        role: "owner",
        route: "/analytics",
        viewport: { width: 1440, height: 1100 },
        // The dashboard's headline figures and its chart, without the page.
        clip: {
            selector: "main div.grid.gap-4:has(> div.grid > .wk-item)",
            pad: 16,
        },
        alt: "Insights for 30 days: site views, unique visitors, enquiries and orders, views by day and the most-viewed pages",
        caption:
            "Insights at Rye & Co.: takings, 304 orders, best week 15 Sep, average order (amounts)",
        gap: "No takings, best week or average order in today's Insights; these are site views, visitors, enquiries and orders at Northwind.",
    },
    {
        key: "i-weeks",
        business: "northwind",
        role: "owner",
        route: "/analytics?range=90d",
        viewport: DESK,
        clip: {
            selector:
                'main div.rounded-xl.border:has-text("Site views by day")',
            pad: 16,
        },
        alt: "Ninety days of site views, a bar for each day",
        caption:
            "Twelve weeks of takings, from 7 Jul to 22 Sep, with 15 Sep marked as the best week",
        gap: "Today's chart is site views by day, not takings by week, and marks no best week.",
    },
    {
        key: "i-store",
        business: "northwind",
        role: "owner",
        route: "/analytics?range=7d",
        viewport: DESK,
        alt: "Insights for the last seven days: site views, enquiries, orders and the most-viewed pages",
        caption:
            "Insights for Hill Road only: takings and 240 orders in four weeks",
        gap: "Insights cannot be narrowed to one location; this is the last seven days for the whole business.",
    },

    // ── Pulse Fitness ──────────────────────────────────────────────────
    {
        key: "g-home",
        business: "pulse",
        role: "owner",
        route: "/",
        viewport: DESK,
        alt: "Home at Pulse Fitness (demo gym): overdue memberships, follow-ups and this week's takings",
        caption:
            "Pulse Fitness's Home: overdue memberships, a failed renewal and today's sessions",
        gap: "The first screen is overdue memberships and follow-ups; today's sessions and the failed renewal sit further down.",
    },
    {
        key: "g-bookings",
        business: "pulse",
        role: "owner",
        route: "/bookings?layout=week&date={nextMonday}",
        viewport: DESK,
        alt: "The week at Pulse Fitness (demo gym): personal training and classes, by the hour",
        caption:
            "Pulse Fitness's week: personal training and classes for each trainer, by the hour",
        gap: "The week view lays out by day, not by trainer; the trainer is on each booking.",
    },
    {
        key: "g-book",
        business: "pulse",
        role: "owner",
        route: "site:/book",
        viewport: DESK,
        alt: "The booking page of Pulse Fitness (demo gym), with services, classes and a summary",
        caption:
            "Pulse Fitness's booking page with services, courses and a summary",
    },
    {
        key: "g-courses",
        business: "pulse",
        role: "owner",
        route: "/courses",
        viewport: DESK,
        alt: "Courses at Pulse Fitness (demo gym): a four-week strength course with the places taken",
        caption:
            "Courses at Pulse: a six-week beginners' course and a 5K course with places filled",
        gap: 'The seed has one course, "Strength foundations — four weeks".',
    },
    {
        key: "g-packs",
        business: "pulse",
        role: "owner",
        route: "/class-packs",
        viewport: DESK,
        alt: "Class packs: 5 and 10 classes with how many are sold and still to use",
        caption:
            "Class packs: 5 and 10 classes with how many are sold and still to use",
    },
    {
        key: "g-customer",
        business: "pulse",
        role: "owner",
        route: "/customers/seed_sc_pulse_contact_182",
        viewport: DESK,
        alt: "Asha Verma's page at Pulse Fitness (demo gym): classes left on her membership and her next booking",
        caption:
            "Farah Khan's page at Pulse: a six-week course, classes left and her next booking",
        gap: "Farah Khan is a Kavi Dental patient in the seed; Asha Verma is on Pulse's four-week course, and the page shows her membership and next booking, not the course.",
    },
    {
        key: "g-subs",
        business: "pulse",
        role: "owner",
        route: "/billing/subscriptions",
        viewport: DESK,
        alt: "Memberships at Pulse Fitness (demo gym) with their next charge",
        caption: "Memberships at Pulse with their next charge",
    },
    {
        key: "g-billing",
        business: "pulse",
        role: "owner",
        route: "/billing/invoices",
        viewport: DESK,
        alt: "Invoices at Pulse Fitness (demo gym), with the overdue ones flagged",
        caption: "Pulse Fitness's invoices with four overdue",
        gap: "The seed has 17 overdue, not four.",
    },
    {
        key: "g-site",
        business: "pulse",
        role: "owner",
        route: "site:/",
        viewport: DESK,
        alt: "The site of Pulse Fitness (demo gym): what's on today and Book a free trial",
        caption:
            "Pulse Fitness's site with classes today and a link to memberships",
        gap: 'Whether classes show under "On today" depends on the hour the shot is taken; Memberships is in the site\'s menu.',
    },

    // ── Kavi Dental ────────────────────────────────────────────────────
    {
        key: "d-home",
        business: "kavi",
        role: "owner",
        route: "/",
        viewport: DESK,
        alt: "Home at Kavi Dental (demo clinic): a patient's note from the booking page, overdue bills and the week so far",
        caption:
            "Kavi Dental's Home: today's patients with their dentist, chair and flags",
        gap: "Home leads with what needs the desk (a booking note, overdue bills), not today's patient list; the seed has no chairs.",
    },
    {
        key: "d-order",
        business: "kavi",
        role: "owner",
        route: "/commerce/orders/seed_sc_kavi_order_rahul_rct",
        viewport: DESK,
        alt: "A root canal at Kavi Dental (demo clinic): visit 1 attended, visit 2 booked, visit 3 still to book",
        caption:
            "Order #D301, a root canal: visit 1 attended, visit 2 today, visit 3 still to book",
        gap: "The order is #ORD-001 and visit 2 is booked for a coming day, not today.",
    },
    {
        key: "d-customer",
        business: "kavi",
        role: "owner",
        route: "/customers/seed_sc_kavi_contact_rahul",
        viewport: DESK,
        alt: "Rahul Verma's page with a note from the booking page about a new blood-pressure tablet",
        caption:
            "Rahul Verma's page with a note from the booking page about a new blood-pressure tablet",
    },
    {
        key: "d-customers",
        business: "kavi",
        role: "owner",
        route: "/commerce/customers",
        viewport: DESK,
        alt: "Patients at Kavi Dental (demo clinic), with medical and allergy tags",
        caption: "Kavi Dental's patients with medical and allergy tags",
    },
    {
        key: "d-book",
        business: "kavi",
        role: "owner",
        route: "site:/book",
        viewport: DESK,
        alt: "The booking page of Kavi Dental (demo clinic), with check-ups, a root canal over three visits and a video consult",
        caption:
            "Kavi Dental's booking page with check-ups, a root canal over three visits and a video consult",
    },
    {
        key: "d-billing",
        business: "kavi",
        role: "owner",
        route: "/billing/invoices",
        viewport: DESK,
        alt: "Bills of supply at Kavi Dental (demo clinic), with the overdue ones flagged",
        caption: "Kavi Dental's bills of supply with one overdue",
        gap: "The seed has 16 overdue, not one.",
    },
    {
        key: "d-site",
        business: "kavi",
        role: "owner",
        route: "site:/",
        viewport: DESK,
        alt: "The site of Kavi Dental (demo clinic): free times today and Book an appointment",
        caption:
            "Kavi Dental's own site on Saroh: free times today and Book an appointment",
    },
    ...HELP_SHOTS,
];
