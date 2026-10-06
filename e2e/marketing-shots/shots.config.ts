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
        site: "northwind",
    },
    /** Asha's first business, with nothing turned on yet (`founder.ts`). */
    asha: {
        id: "seed_org_first-run_business",
        name: "Asha's Bakery",
        site: "first-run-business",
    },
} as const;

export type Business = keyof typeof BUSINESSES;

/**
 * Who signs in. Most shots are taken as the demo owner. Help's "Create your
 * business" also needs Asha, the seed's founder, whose first business has
 * nothing turned on, and a newcomer: an account with no business at all,
 * which the seed has none of. Make it by hand on the throwaway database
 * before the capture (`content/help/README.md`). A `visitor` is signed out.
 */
export const ROLES = {
    owner: "demo@saroh.dev",
    founder: "founder@saroh.dev",
    newcomer: "new.owner@saroh.dev",
} as const;

export type Role = keyof typeof ROLES | "visitor";

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
    /** The business opened first; none for sign-up and setup. */
    business?: Business;
    role: Role;
    /**
     * A workspace path (`/commerce/orders`), `site:<path>` for the
     * business's own site on the renderer, or `accounts:<path>` for the
     * accounts app (sign-up). `{nextMonday}` is replaced with
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

/* "Set your team's hours": Kavi Dental's Availability, looked at only.
 * Kavi is the demo business whose storefront has opening hours (Mon–Sat
 * 09:00–19:00, Sun 10:00–13:00), so the page says in-person bookings fall
 * inside them (DEC-087). The dentists' seeded hours all fall inside, so
 * "+ Hours" on Dr. Pillai's Saturday is set to 19:00–20:00 to show a
 * stretch that isn't bookable in person. Picking a person, the times and
 * Add are the page's own draft; nothing is saved (Save hours is never
 * pressed). */
const AVAILABILITY = "/bookings/availability";
const PICK = (name: string): Step => ({
    click: `[role="radiogroup"][aria-label="Team member"] [role="radio"]:has-text("${name}")`,
});
const SATURDAY =
    'section[aria-labelledby="weekly-hours"] li:has-text("Saturday")';
const SATURDAY_EVENING: Step[] = [
    PICK("Arun Pillai"),
    { click: `${SATURDAY} button:has-text("Hours")` },
    { click: `${SATURDAY} [aria-label="From"]` },
    { click: '[role="option"]:has-text("19:00")' },
    { click: `${SATURDAY} [aria-label="To"]` },
    { click: '[role="option"]:has-text("20:00")' },
    // Out of the picker, so no focus ring is in the picture.
    { click: 'section[aria-labelledby="weekly-hours"] #weekly-hours' },
    {
        waitFor:
            'section[aria-labelledby="weekly-hours"] button:text-is("Add")',
    },
];
const SATURDAY_ADDED: Step[] = [
    ...SATURDAY_EVENING,
    {
        click: 'section[aria-labelledby="weekly-hours"] button:text-is("Add")',
    },
    { waitFor: 'button:has-text("Save hours")' },
];

/* "Take a deposit when they book": Kavi Dental's root canal, looked at
 * (a chip clicked, never saved); the booking page of Northwind, whose
 * Warehouse walkthrough was set to a 50% deposit on the throwaway
 * database, walked to its Paying step and never booked. Kavi's seeded
 * Razorpay connection has no key id, so its checkout can't open: the
 * editor and Services say it can't be booked online (DEC-088). */
const KAVI_ROOT_CANAL = "/services/seed_sc_kavi_service_2";
const KAVI_PRICE = 'section:has(h2:text-is("Price"))';

/* "Set up a monthly plan": Rye & Co.'s plans and subscribers, looked at;
 * the dialog is opened and closed unsent. The draft plan to publish is
 * Northwind's ("Packing supplies, monthly", made on the throwaway
 * database), opened from its card and never published. */
const RYE_PLANS = "/billing/subscriptions?tab=plans";

/* "Connect your own domain" and "Make your link look right when shared":
 * Northwind's site settings. Its seeded domain, northwindsupply.in, waits
 * for DNS; the domain box is typed into and never added. The web address
 * is the API's (`site-origin.ts` rendererHost): run the API with
 * RENDERER_URL=https://saroh.app for help-own-domain-1, so it reads
 * northwind.saroh.app as in production, not the local renderer's host. */
const NW_SETTINGS = "/sites/seed_site_0/settings";
const DOMAIN = 'section:has(h2:text-is("Your own domain"))';
const SHARE = 'section:has(h2:text-is("Social share image"))';
const SEARCH = 'section:has(h2:text-is("Search"))';

const HELP_SHOTS_B: Shot[] = [
    // ── Set your team's hours (Kavi Dental) ───────────────────────────
    {
        key: "help-team-hours-1",
        business: "kavi",
        role: "owner",
        route: AVAILABILITY,
        viewport: { width: 1280, height: 720 },
        steps: [PICK("Arun Pillai")],
        mark: '[role="radiogroup"][aria-label="Team member"] [role="radio"]:has-text("Arun Pillai")',
        alt: "Availability at Kavi Dental (demo clinic): the dentists across the top, Dr. Arun Pillai picked, the note that in-person bookings fall inside opening hours, and his weekly hours",
        caption: "Availability at Kavi Dental, with Dr. Arun Pillai picked",
    },
    {
        key: "help-team-hours-2",
        business: "kavi",
        role: "owner",
        route: AVAILABILITY,
        viewport: { width: 1280, height: 1000 },
        steps: SATURDAY_EVENING,
        clip: { selector: 'section[aria-labelledby="weekly-hours"]', pad: 12 },
        mark: 'section[aria-labelledby="weekly-hours"] button:text-is("Add")',
        alt: "Dr. Arun Pillai's weekly hours at Kavi Dental (demo clinic), a day at a time, with 19:00 to 20:00 being added on Saturday",
        caption:
            "Dr. Arun Pillai's weekly hours, with + Hours open on Saturday",
    },
    {
        key: "help-team-hours-3",
        business: "kavi",
        role: "owner",
        route: AVAILABILITY,
        viewport: { width: 1280, height: 1000 },
        steps: SATURDAY_ADDED,
        clip: { selector: 'section[aria-labelledby="weekly-hours"]', pad: 12 },
        mark: `${SATURDAY} p:has-text("bookable in person")`,
        alt: "Dr. Arun Pillai's Saturday at Kavi Dental (demo clinic) with 19:00–20:00 added, drawn dashed, and the line saying it isn't bookable in person because the clinic is open 09:00–19:00",
        caption: "Saturday evening added past closing, not bookable in person",
    },
    {
        key: "help-team-hours-4",
        business: "kavi",
        role: "owner",
        route: AVAILABILITY,
        viewport: { width: 1280, height: 720 },
        steps: SATURDAY_ADDED,
        mark: 'button:has-text("Save hours")',
        alt: "Availability at Kavi Dental (demo clinic) with a change not saved yet, and the bar with Discard and Save hours",
        caption: "A change to Dr. Arun Pillai's hours, waiting for Save hours",
    },
    {
        key: "help-team-hours-5",
        business: "kavi",
        role: "owner",
        route: AVAILABILITY,
        viewport: { width: 1280, height: 1400 },
        steps: [PICK("Arun Pillai")],
        clip: { selector: 'section:has(h2:text-is("Time off"))', pad: 12 },
        mark: 'section:has(h2:text-is("Time off")) button:has-text("Add day off")',
        alt: "Time off for Dr. Arun Pillai at Kavi Dental (demo clinic): his day at a dental conference, and the form to add more",
        caption: "Dr. Arun Pillai's time off, and the form to add a day off",
    },
    {
        key: "help-team-hours-6",
        business: "kavi",
        role: "owner",
        route: AVAILABILITY,
        viewport: { width: 1280, height: 1400 },
        clip: { selector: 'section[aria-labelledby="booking-rules"]', pad: 12 },
        mark: '[aria-label="How people pay when they book"]',
        alt: "Booking rules at Kavi Dental (demo clinic): how far ahead people can book, the latest they can book, free cancellation, refunds and how people pay when they book",
        caption: "Kavi Dental's booking rules, for the whole business",
    },

    // ── Take a deposit when they book (Kavi Dental, Northwind) ─────────
    {
        key: "help-take-deposit-1",
        business: "kavi",
        role: "owner",
        route: "/services",
        viewport: { width: 1024, height: 760 },
        mark: 'a[aria-label="Edit Root canal treatment"]',
        alt: "Services at Kavi Dental (demo clinic): each with its price, length and who takes it, and an Edit button; the root canal is marked Can't be booked online, as no payment provider is connected",
        caption: "Services at Kavi Dental, with Edit on the root canal",
    },
    {
        key: "help-take-deposit-2",
        business: "kavi",
        role: "owner",
        route: KAVI_ROOT_CANAL,
        viewport: { width: 1280, height: 1400 },
        clip: { selector: KAVI_PRICE, pad: 12 },
        mark: 'section:has(h2:text-is("Price")) [role="radio"][aria-checked="true"]',
        alt: "The root canal's price at Kavi Dental (demo clinic), with At booking, they pay set to a 50% deposit, what that means, and the warning that people can't book it online while no payment provider is connected",
        caption: "The root canal's price, with a 50% deposit at booking",
    },
    {
        key: "help-take-deposit-3",
        business: "kavi",
        role: "owner",
        route: KAVI_ROOT_CANAL,
        viewport: { width: 1024, height: 560 },
        steps: [
            {
                click: 'section:has(h2:text-is("Price")) [role="radio"]:has-text("25% deposit")',
            },
        ],
        mark: 'button:has-text("Save changes")',
        alt: "The root canal at Kavi Dental (demo clinic) with a change not saved yet, and Save changes at the top right",
        caption: "A change to the root canal, waiting for Save changes",
    },
    {
        key: "help-take-deposit-4",
        business: "northwind",
        role: "owner",
        route: "site:/book?service=seed_service_1",
        viewport: { width: 1280, height: 2000 },
        steps: [
            {
                click: 'button:text-matches("^\\\\d\\\\d:\\\\d\\\\d$") >> nth=2',
            },
            { fill: 'input[autocomplete="name"]', value: "Meena Iyer" },
            { waitFor: '[role="radiogroup"][aria-label="Paying"]' },
        ],
        clip: {
            selector: 'div:has(> [role="radiogroup"][aria-label="Paying"])',
            pad: 16,
        },
        mark: '[role="radiogroup"][aria-label="Paying"] [role="radio"] >> nth=0',
        alt: "The booking page of Northwind Supply (demo store), at Paying: a deposit now and the rest at the visit, or the full price now",
        caption:
            "Paying on Northwind Supply's booking page: the deposit, or the full price",
    },
    {
        key: "help-take-deposit-5",
        business: "kavi",
        role: "owner",
        route: "site:/book?service=seed_sc_kavi_service_2",
        viewport: { width: 1280, height: 900 },
        clip: { selector: 'aside[aria-label="Your booking"]', pad: 12 },
        mark: 'aside[aria-label="Your booking"] p[role="status"]',
        alt: "The booking summary on the site of Kavi Dental (demo clinic), saying it can't take the deposit online right now",
        caption:
            "Kavi Dental's booking page, with no way to take the deposit online",
    },

    // ── Set up a monthly plan (Rye & Co., Northwind) ──────────────────
    {
        key: "help-monthly-plan-1",
        business: "rye",
        role: "owner",
        route: RYE_PLANS,
        viewport: { width: 1024, height: 560 },
        mark: 'a:has-text("New plan")',
        alt: "Plans at Rye & Co. (demo bakery): a weekly loaf and a monthly one, each with its subscribers, and the New plan button",
        caption: "Plans at Rye & Co., with New plan",
    },
    {
        key: "help-monthly-plan-2",
        business: "rye",
        role: "owner",
        route: "/billing/plans/seed_sc_rc_plan_1/edit",
        viewport: { width: 1280, height: 1000 },
        clip: {
            selector: 'section:has(h2:text-is("Details"))',
            until: 'section:has(h2:text-is("Price and billing"))',
            pad: 12,
        },
        mark: '[role="radio"]:has-text("Every month")',
        alt: "The monthly sourdough plan at Rye & Co. (demo bakery): its name, what's included, the price and Charged every month",
        caption:
            "Rye & Co.'s monthly plan: name, what's included, price, charged every month",
    },
    {
        key: "help-monthly-plan-3",
        business: "northwind",
        role: "owner",
        route: "/billing/subscriptions?tab=plans",
        viewport: { width: 1024, height: 560 },
        steps: [
            { click: 'a[aria-label="Edit Packing supplies, monthly"]' },
            { waitFor: 'button:text-is("Publish")' },
        ],
        mark: 'button:text-is("Publish"):visible',
        alt: "A new monthly plan at Northwind Supply (demo store), saved as a draft that nobody can join yet, with the Publish button",
        caption: "A draft plan at Northwind Supply, waiting for Publish",
    },
    {
        key: "help-monthly-plan-4",
        business: "rye",
        role: "owner",
        route: "/billing/subscriptions?subscribe=1",
        viewport: { width: 1024, height: 760 },
        steps: [
            { waitFor: '[role="dialog"]' },
            {
                click: '[role="dialog"] [role="combobox"]:has-text("Sourdough")',
            },
            { click: '[role="option"]:has-text("Sourdough, monthly")' },
            // Out of the fields, so no focus ring is in the picture.
            { click: '[role="dialog"] h2' },
        ],
        mark: '[role="dialog"] button:has-text("Subscribe")',
        alt: "Subscribe someone at Rye & Co. (demo bakery): who, the plan and the start date, with when the first invoice is issued",
        caption: "Subscribe someone at Rye & Co.",
    },
    {
        key: "help-monthly-plan-5",
        business: "rye",
        role: "owner",
        route: "/billing/subscriptions/seed_sc_rc_sub_sana",
        viewport: { width: 1280, height: 1000 },
        clip: { selector: 'section[aria-labelledby="charges-title"]', pad: 12 },
        mark: 'section[aria-labelledby="charges-title"] a[href^="/billing/invoices/"] >> nth=0',
        alt: "Sana Qureshi's monthly plan at Rye & Co. (demo bakery): a paid invoice for each month",
        caption:
            "Sana Qureshi's charges at Rye & Co.: an invoice for each month",
    },
    {
        key: "help-monthly-plan-6",
        business: "rye",
        role: "owner",
        route: "/billing/subscriptions/seed_sc_rc_sub_arjun",
        viewport: { width: 1024, height: 560 },
        mark: 'button:has-text("Retry with a new pay link")',
        alt: "Arjun Mehta's subscription at Rye & Co. (demo bakery): a renewal not paid, with Retry with a new pay link",
        caption: "Arjun Mehta's renewal at Rye & Co., not paid yet",
    },

    // ── Connect your own domain (Northwind) ───────────────────────────
    {
        key: "help-own-domain-1",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1024, height: 560 },
        mark: 'nav[aria-label="Website"] a:has-text("Settings")',
        alt: "The website of Northwind Supply (demo store) in Saroh, on its Settings tab",
        caption: "Northwind Supply's website, on Settings",
    },
    {
        key: "help-own-domain-2",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 1400 },
        steps: [
            {
                fill: '[aria-label="Domain to add"]',
                value: "www.northwindsupply.in",
            },
            { click: `${DOMAIN} h2` },
        ],
        clip: { selector: DOMAIN, pad: 12 },
        mark: `${DOMAIN} button:has-text("Add domain")`,
        alt: "Your own domain at Northwind Supply (demo store): a second domain typed in, ready for Add domain",
        caption: "Your own domain at Northwind Supply, a domain typed in",
    },
    {
        key: "help-own-domain-3",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 1400 },
        clip: { selector: DOMAIN, pad: 12 },
        mark: `${DOMAIN} code[title^="_saroh-verification"]`,
        alt: "The TXT record Northwind Supply (demo store) is asked to add at its registrar: its type, name and value, each with Copy",
        caption: "The record that proves Northwind Supply owns its domain",
    },
    {
        key: "help-own-domain-4",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 1400 },
        clip: { selector: DOMAIN, pad: 12 },
        mark: `${DOMAIN} button:has-text("Check now")`,
        alt: "Northwind Supply's (demo store) domain waiting for DNS, with Check now",
        caption: "Northwind Supply's domain, waiting for DNS",
    },
    {
        key: "help-own-domain-5",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 1400 },
        clip: { selector: DOMAIN, pad: 12 },
        mark: `${DOMAIN} code:text-is("CNAME")`,
        alt: "A verified domain at Northwind Supply (demo store), with the CNAME record that sends visitors to the site",
        caption:
            "Northwind Supply's domain once verified, and the record that sends visitors",
    },

    // ── Make your link look right when shared (Northwind) ─────────────
    {
        key: "help-share-image-1",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 3000 },
        clip: { selector: SHARE, pad: 12 },
        mark: `${SHARE} button:text-is("Add")`,
        alt: "Social share image at Northwind Supply (demo store): nothing set yet, and how the link looks on each app without one",
        caption: "Social share image at Northwind Supply, nothing set yet",
    },
    {
        key: "help-share-image-2",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 3000 },
        steps: [{ click: `${SHARE} button:text-is("Add")` }],
        clip: {
            selector: `${SHARE} div.grid:has(> div:text-is("Image"))`,
            pad: 12,
        },
        mark: `${SHARE} button:has-text("Choose a photo")`,
        alt: "Adding a social share image at Northwind Supply (demo store): Choose a photo, or paste an image address, then Save",
        caption: "Adding a share image at Northwind Supply",
    },
    {
        key: "help-share-image-3",
        business: "northwind",
        role: "owner",
        route: NW_SETTINGS,
        viewport: { width: 1280, height: 3000 },
        steps: [
            { click: `${SEARCH} button:text-is("Edit") >> nth=1` },
            {
                fill: '[aria-label="Search description"]',
                value: "Packaging, cleaning and workshop supplies for small manufacturers in Peenya, Bengaluru. Order by phone or online.",
            },
            { click: `${SEARCH} h2` },
        ],
        clip: { selector: SEARCH, pad: 12 },
        mark: '[aria-label="Search description"]',
        alt: "Search at Northwind Supply (demo store): a description being written, and the preview of how it reads",
        caption: "Writing Northwind Supply's description under Search",
    },
    {
        key: "help-share-image-4",
        business: "northwind",
        role: "owner",
        route: "/sites/seed_site_0/pages",
        viewport: { width: 1024, height: 560 },
        mark: 'a:has-text("Review and publish")',
        alt: "The website of Northwind Supply (demo store), with changes waiting to be published and Review and publish",
        caption: "Northwind Supply's changes, waiting to be published",
    },
];

/* Create your business. */

/** The setup form, answered as a florist would, never created. */
const SETUP_FILLED: Step[] = [
    { waitFor: 'text="What are you setting up?"' },
    { click: '[role="radio"]:has-text("A business")' },
    { fill: 'input[autocomplete="organization"]', value: "Tulsi Florist" },
    { waitFor: 'text="Free — your website will live here."' },
];

/** A setup form item: the field's own block, label to description. */
const setupItem = (label: string) =>
    `form > div.space-y-2:has(label:text-is("${label}"))`;

const CREATE_BUSINESS_SHOTS: Shot[] = [
    {
        key: "help-create-business-1",
        role: "visitor",
        route: "accounts:/signup",
        viewport: { width: 1024, height: 820 },
        steps: [
            { fill: 'input[placeholder="Your name"]', value: "Kiran Desai" },
            { fill: 'input[type="email"]', value: "kiran@tulsiflorist.in" },
            { fill: 'input[type="password"]', value: "a-long-password" },
            { click: "h1" },
        ],
        clip: { selector: "form", pad: 12 },
        mark: 'button:has-text("Send the code")',
        alt: "Make your account on Saroh: your name, email and password, and the Send the code button",
        caption: "Make your account: name, email, password, then Send the code",
    },
    {
        key: "help-create-business-2",
        role: "newcomer",
        route: "/onboarding",
        viewport: { width: 1024, height: 760 },
        steps: [{ waitFor: 'text="What are you setting up?"' }],
        clip: { selector: "form", pad: 16 },
        mark: '[role="radio"]:has-text("A business")',
        alt: "Set up Saroh, asking what you are setting up: a business, just me, or a site for my work",
        caption:
            "What are you setting up? A business, Just me, or A site for my work",
    },
    {
        key: "help-create-business-3",
        role: "newcomer",
        route: "/onboarding",
        viewport: { width: 1024, height: 1000 },
        steps: [...SETUP_FILLED, { click: "h1" }],
        clip: {
            selector: setupItem("What is it called?"),
            until: setupItem("Its address on Saroh"),
            pad: 16,
        },
        mark: `${setupItem("Its address on Saroh")} div.font-mono`,
        alt: "Setting up Tulsi Florist (a demo florist): its name, and its address on Saroh, tulsi-florist.saroh.app, marked free",
        caption: "The name, and the address on Saroh made from it",
    },
    {
        key: "help-create-business-4",
        role: "newcomer",
        route: "/onboarding",
        viewport: { width: 1024, height: 1400 },
        steps: [
            ...SETUP_FILLED,
            { click: '[role="radio"]:has-text("Not registered")' },
            { click: "h1" },
        ],
        clip: {
            selector: setupItem("Is it registered as a company?"),
            until: 'form button[type="submit"]',
            pad: 16,
        },
        mark: 'button:has-text("Create the business")',
        alt: "Setting up Tulsi Florist (a demo florist): Not registered chosen, India as where it trades, and the Create the business button",
        caption: "Registered or not, where it trades, then Create the business",
    },
    {
        key: "help-create-business-5",
        business: "asha",
        role: "founder",
        route: "/",
        viewport: HELP_DESK,
        steps: [
            { click: 'button:has-text("Sell things")' },
            { waitFor: '[role="dialog"]' },
        ],
        mark: '[role="dialog"] button:text-is("Turn on")',
        alt: "Home at Asha's Bakery (demo bakery), new and with nothing on yet: What will you do first?, with Turn on Sell open",
        caption:
            "What will you do first? at Asha's Bakery, with Turn on Sell open",
    },
];

/* Add your GSTIN: Northwind, which isn't GST-registered in the seed. */

const NW_TAX = "/settings/organization?section=tax";

/** GST switched on and a GSTIN typed, never saved. */
const GST_ON: Step[] = [
    { click: '#business-panel button:text-is("Edit")' },
    { click: '[role="switch"][aria-label="GST-registered"]' },
    {
        fill: '#business-panel input[placeholder="29ABCDE1234F1ZW"]',
        value: "29AAGCN4821K1Z5",
    },
    { click: '[role="tab"]:text-is("Tax and invoices")' },
];

const GSTIN_SHOTS: Shot[] = [
    {
        key: "help-add-gstin-1",
        business: "northwind",
        role: "owner",
        route: NW_TAX,
        viewport: HELP_DESK,
        mark: '#business-panel button:text-is("Edit")',
        alt: "Settings, Business, Tax and invoices at Northwind Supply (demo shop): not GST-registered yet, with the Edit button",
        caption: "Tax and invoices at Northwind Supply, not GST-registered yet",
    },
    {
        key: "help-add-gstin-2",
        business: "northwind",
        role: "owner",
        route: NW_TAX,
        viewport: { width: 1280, height: 1100 },
        steps: GST_ON,
        clip: {
            selector:
                '#business-panel div.space-y-2:has(> div > button[role="switch"])',
            until: '#business-panel div.space-y-2:has(> input[placeholder="29ABCDE1234F1ZW"])',
            pad: 14,
        },
        mark: '#business-panel input[placeholder="29ABCDE1234F1ZW"]',
        alt: "Northwind Supply (demo shop) with GST-registered switched on and a GSTIN typed, its state code, PAN, entity, Z and check character shown under it",
        caption: "GST-registered on, and the GSTIN broken into its parts",
    },
    {
        key: "help-add-gstin-3",
        business: "northwind",
        role: "owner",
        route: "/settings/organization?section=address",
        viewport: HELP_DESK,
        mark: '[role="tab"]:text-is("Registered address")',
        alt: "The Registered address tab at Northwind Supply (demo shop): the address, city, PIN and state printed under the legal name",
        caption:
            "Northwind Supply's registered address, printed under its legal name",
    },
    {
        key: "help-add-gstin-4",
        business: "northwind",
        role: "owner",
        route: NW_TAX,
        viewport: { width: 1440, height: 1000 },
        steps: GST_ON,
        clip: { selector: 'aside[aria-label="How it prints"]', pad: 12 },
        mark: 'aside[aria-label="How it prints"] span:text-is("Tax invoice")',
        alt: "How it prints at Northwind Supply (demo shop), showing the unsaved edit: a tax invoice with the GSTIN and Karnataka",
        caption: "How it prints, now a tax invoice with the GSTIN",
    },
    {
        key: "help-add-gstin-5",
        business: "northwind",
        role: "owner",
        route: NW_TAX,
        viewport: HELP_DESK,
        clip: {
            selector: 'section[aria-label="Ready to take payments"]',
            pad: 12,
        },
        mark: 'section[aria-label="Ready to take payments"] :text-is("Choose type")',
        alt: "Ready to take payments at Northwind Supply (demo shop): Choose your business type, with the Choose type button",
        caption:
            "Ready to take payments at Northwind Supply: Choose your business type",
    },
];

/* Take your first order: Northwind's counter. */

/** A counter order for Meera Iyer, never created. */
const COUNTER_ORDER: Step[] = [
    { waitFor: '[role="dialog"]' },
    { click: '[role="dialog"] :text-is("Meera Iyer")' },
    { click: '[role="dialog"] :text("Standard · ₹260")' },
];

const ORDER_SHOTS: Shot[] = [
    {
        key: "help-take-order-1",
        business: "northwind",
        role: "owner",
        route: "/commerce/orders",
        viewport: HELP_DESK,
        steps: [LATE_RULE_NOTICE],
        mark: 'main button:has-text("New order")',
        alt: "Orders at Northwind Supply (demo shop), with the New order button",
        caption: "Orders at Northwind Supply, with New order at the top right",
    },
    {
        key: "help-take-order-2",
        business: "northwind",
        role: "owner",
        route: "/commerce/orders?new=1",
        viewport: { width: 1280, height: 900 },
        steps: COUNTER_ORDER,
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] :text-is("Meera Iyer")',
        alt: "New order at Northwind Supply (demo shop): taken at the store, Meera Iyer picked as the customer, and a hi-vis vest added",
        caption: "New order: where it's taken, the customer, and the items",
    },
    {
        key: "help-take-order-3",
        business: "northwind",
        role: "owner",
        route: "/commerce/orders?new=1",
        viewport: { width: 1280, height: 900 },
        steps: [
            ...COUNTER_ORDER,
            {
                fill: '[role="dialog"] input[placeholder="Delivery address"]',
                value: "14 MG Road",
            },
            {
                fill: '[role="dialog"] input[placeholder="Town or city"]',
                value: "Bengaluru",
            },
            {
                fill: '[role="dialog"] input[placeholder="State"]',
                value: "Karnataka",
            },
            {
                fill: '[role="dialog"] input[aria-label="PIN code"]',
                value: "560001",
            },
            { click: '[role="dialog"] button:text-is("UPI at the counter")' },
        ],
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] button:has-text("UPI received · create")',
        alt: "New order at Northwind Supply (demo shop): local delivery to an address, UPI at the counter, and the UPI received, create button",
        caption:
            "How it leaves and how it's paid, then the button that creates it",
    },
    {
        key: "help-take-order-4",
        business: "northwind",
        role: "owner",
        // #ORD-004: a paid pick-up order, ready.
        route: "/commerce/orders/seed_order_3",
        viewport: HELP_DESK,
        mark: 'main button:has-text("Mark collected")',
        alt: "Order #ORD-004 at Northwind Supply (demo shop): a pick-up order at Ready, with the Mark collected button",
        caption:
            "Order #ORD-004 at Ready, with Mark collected at the top right",
    },
    {
        key: "help-take-order-5",
        business: "northwind",
        role: "owner",
        // #ORD-002: a local delivery not paid yet.
        route: "/commerce/orders/seed_order_1",
        viewport: HELP_DESK,
        mark: 'main button:has-text("Paid in cash")',
        alt: "Order #ORD-002 at Northwind Supply (demo shop), not paid yet, with the Paid in cash button",
        caption: "Order #ORD-002, not paid yet, with Paid in cash",
    },
    {
        key: "help-take-order-6",
        business: "northwind",
        role: "owner",
        route: "/commerce/orders",
        viewport: HELP_DESK,
        steps: [
            LATE_RULE_NOTICE,
            { click: 'main button:has-text("All locations")' },
            { waitFor: '[role="listbox"], [role="menu"]' },
        ],
        mark: 'main button:has-text("All locations")',
        alt: "Orders at Northwind Supply (demo shop), with All locations open on its two locations, Northwind Supply Store and Online",
        caption: "Orders at Northwind Supply, filtered by location",
    },
];

/* Connect Razorpay (Northwind) and Cashfree (Rye & Co.): filled, never connected. */

/** The payments setup dialog's numbered step, by its heading's words. */
const paySection = (words: string) =>
    `[role="dialog"] section:has(h3:has-text("${words}"))`;

const RAZORPAY_KEYS: Step[] = [
    { click: 'button[aria-label="Connect Razorpay"]' },
    { waitFor: '[role="dialog"]' },
    { fill: '[role="dialog"] input >> nth=0', value: "rzp_test_Q4dMx9fA3fA9" },
    {
        fill: '[role="dialog"] input[type="password"] >> nth=0',
        value: "a-key-secret",
    },
    // Out of the field, so no focus ring is in the picture.
    { click: '[role="dialog"] h2:text-is("Payments")' },
];

const CASHFREE_KEYS: Step[] = [
    { click: 'button[aria-label="Connect Cashfree"]' },
    { waitFor: '[role="dialog"]' },
    { fill: '[role="dialog"] input >> nth=0', value: "TEST10427c21" },
    {
        fill: '[role="dialog"] input[type="password"] >> nth=0',
        value: "a-key-secret",
    },
    // Out of the field, so no focus ring is in the picture.
    { click: '[role="dialog"] h2:text-is("Payments")' },
];

const PAYMENT_SHOTS: Shot[] = [
    {
        key: "help-connect-razorpay-1",
        business: "northwind",
        role: "owner",
        route: "/settings/providers",
        viewport: HELP_DESK,
        mark: 'button[aria-label="Connect Razorpay"]',
        alt: "Settings, Providers at Northwind Supply (demo shop): Razorpay disconnected, with its Connect button",
        caption: "Providers at Northwind Supply, Razorpay with Connect",
    },
    {
        key: "help-connect-razorpay-2",
        business: "northwind",
        role: "owner",
        route: "/settings/providers",
        viewport: { width: 1280, height: 1600 },
        steps: RAZORPAY_KEYS,
        clip: { selector: paySection("Your API keys"), pad: 12 },
        mark: `${paySection("Your API keys")} input >> nth=0`,
        alt: "Connecting Razorpay at Northwind Supply (demo shop): Key ID (public) and Key secret filled in",
        caption: "Your API keys: the key id and the key secret",
    },
    {
        key: "help-connect-razorpay-3",
        business: "northwind",
        role: "owner",
        route: "/settings/providers",
        viewport: { width: 1280, height: 1600 },
        steps: RAZORPAY_KEYS,
        clip: {
            selector: paySection("where to send payment updates"),
            pad: 12,
        },
        mark: 'button[aria-label="Copy webhook URL"]',
        alt: "Connecting Razorpay at Northwind Supply (demo shop): the webhook URL to copy, and the five events to tick",
        caption: "The webhook URL to copy, and the events to tick",
    },
    {
        key: "help-connect-razorpay-4",
        business: "northwind",
        role: "owner",
        route: "/settings/providers",
        viewport: { width: 1280, height: 1600 },
        steps: [
            ...RAZORPAY_KEYS,
            { click: 'button[aria-label="Generate a webhook signing secret"]' },
        ],
        clip: {
            selector: paySection("Webhook signing secret"),
            until: '[role="dialog"] button[type="submit"]',
            pad: 12,
        },
        mark: '[role="dialog"] button[type="submit"]',
        alt: "Connecting Razorpay at Northwind Supply (demo shop): a webhook signing secret generated, and the Connect Razorpay button",
        caption: "The webhook signing secret, then Connect Razorpay",
    },
    {
        key: "help-connect-cashfree-1",
        business: "rye",
        role: "owner",
        route: "/settings/providers",
        viewport: HELP_DESK,
        mark: 'button[aria-label="Connect Cashfree"]',
        alt: "Settings, Providers at Rye & Co. (demo bakery): Cashfree under Available, with its Connect button",
        caption: "Providers at Rye & Co., Cashfree with Connect",
    },
    {
        key: "help-connect-cashfree-2",
        business: "rye",
        role: "owner",
        route: "/settings/providers",
        viewport: { width: 1280, height: 1600 },
        steps: CASHFREE_KEYS,
        clip: { selector: paySection("Your API keys"), pad: 12 },
        mark: `${paySection("Your API keys")} input >> nth=0`,
        alt: "Connecting Cashfree at Rye & Co. (demo bakery): Key ID and Key secret filled in, and the optional Public key",
        caption:
            "Your API keys: Key ID, Key secret and the optional public key",
    },
    {
        key: "help-connect-cashfree-3",
        business: "rye",
        role: "owner",
        route: "/settings/providers",
        viewport: { width: 1280, height: 1600 },
        steps: CASHFREE_KEYS,
        clip: {
            selector: paySection("where to send payment updates"),
            pad: 12,
        },
        mark: 'button[aria-label="Copy webhook URL"]',
        alt: "Connecting Cashfree at Rye & Co. (demo bakery): the webhook URL to copy, and the four events to tick",
        caption: "The webhook URL to copy, and the events to tick",
    },
    {
        key: "help-connect-cashfree-4",
        business: "rye",
        role: "owner",
        route: "/settings/providers",
        viewport: { width: 1280, height: 1600 },
        steps: CASHFREE_KEYS,
        clip: {
            selector:
                '[role="dialog"] p:has-text("so there\'s no separate secret to add")',
            until: '[role="dialog"] button[type="submit"]',
            pad: 12,
        },
        mark: '[role="dialog"] button[type="submit"]',
        alt: "Connecting Cashfree at Rye & Co. (demo bakery): no separate secret to add, and the Connect Cashfree button",
        caption: "No separate secret for Cashfree, then Connect Cashfree",
    },
    {
        key: "help-connect-cashfree-5",
        business: "northwind",
        role: "owner",
        route: "/settings/providers",
        viewport: HELP_DESK,
        mark: 'main :text("No payment updates received yet")',
        alt: "Settings, Providers at Northwind Supply (demo shop): Cashfree connected, with no payment updates received yet",
        caption:
            "Cashfree connected at Northwind Supply, waiting for its first payment update",
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
    ...HELP_SHOTS_B,
    ...CREATE_BUSINESS_SHOTS,
    ...GSTIN_SHOTS,
    ...ORDER_SHOTS,
    ...PAYMENT_SHOTS,
];
