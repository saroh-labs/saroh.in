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
    rye: {
        id: "seed_sc_rc_org",
        name: "Rye & Co.",
        site: "rye-and-co",
        owner: "Asha Rao",
    },
    pulse: {
        id: "seed_sc_pulse_org",
        name: "Pulse Fitness",
        site: "pulse-fitness",
        owner: "Karan Mehta",
    },
    kavi: {
        id: "seed_sc_kavi_org",
        name: "Kavi Dental",
        site: "kavi-dental",
        owner: "Meera Iyer",
    },
    /** The demo salon (`salon-data.ts`, NOOR): Share and, later, Ask AI. */
    gulmohar: {
        id: "seed_sc_ns_org",
        name: "Gulmohar Salon & Bridal",
        site: "gulmohar-salon",
        owner: "Zoya Khan",
    },
    northwind: {
        id: "seed_org",
        name: "Northwind Supply",
        site: "northwind",
        owner: "Rahul Nair",
    },
    /** Asha's first business, with nothing turned on yet (`founder.ts`). */
    asha: {
        id: "seed_org_first-run_business",
        name: "Asha's Bakery",
        site: "first-run-business",
    },
    // The Global edition's, from `db:seed:global`; `shots.global.ts` takes them.
    thistlewick: {
        id: "seed_gl_shop_org",
        name: "Thistlewick Bakery",
        site: "thistlewick-bakery",
        owner: "Clara Pike",
        locale: "en-US",
    },
    larkspur: {
        id: "seed_gl_salon_org",
        name: "Larkspur & Vane",
        site: "larkspur-and-vane",
        owner: "Imogen Vane",
        locale: "en-GB",
    },
    ironvale: {
        id: "seed_gl_gym_org",
        name: "Ironvale Fitness",
        site: "ironvale-fitness",
        owner: "Jordan Reyes",
        locale: "en-US",
    },
    wrenfield: {
        id: "seed_gl_clinic_org",
        name: "Wrenfield Dental",
        site: "wrenfield-dental",
        owner: "Elena Ward",
        locale: "en-US",
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
    | { fill: string; value: string }
    /** Scroll this scrolling area back to its top. */
    | { scrollTop: string };

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
    /**
     * Instead of a clip: the whole viewport, scrolled so this is in view.
     * A feature step shows the full desk app around what it's about (owner, 16 Nov 2026).
     */
    focus?: string;
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
    /**
     * Another product's own screen (Claude's, ChatGPT's), which the stack
     * can't open: the image is put in place by hand and kept, never taken.
     * Says where it came from.
     */
    supplied?: string;
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
 * database), opened from its row's menu and never published. */
const RYE_PLANS = "/billing/subscriptions?tab=plans";

/* "Connect your own domain" and "Make your link look right when shared":
 * Northwind's site settings. Its seeded domain, northwindsupply.in, waits
 * for DNS; Add domain's dialog is typed into and never added. A row's
 * field is in its side sheet or dialog (read first, 10 Oct), so a shot of
 * one opens it and clips the `[role="dialog"]`. The web address
 * is the API's (`site-origin.ts` rendererHost): run the API with
 * RENDERER_URL=https://saroh.app for help-own-domain-1, so it reads
 * northwind.saroh.app as in production, not the local renderer's host. */
const NW_SETTINGS = "/sites/seed_site_0/settings";
/* The settings' tabs (Website › Settings, 9 Oct): the domain is in
 * Address (the first tab), the share image and the description in Search
 * and sharing, the codes and trackers in Tracking; a shot opens its tab
 * with `?section=`. */
const DOMAIN = "#address";
const SHARE = "#search-and-sharing";
/** The verification codes fold; a shot that shows them opens them first. */
const OPEN_CODES: Step = { click: "[data-verification-codes] summary" };

/* "Verify your site and add analytics": Search and tracking, at the foot of
 * Northwind's site settings (DEC-108), with the API's RENDERER_URL set to
 * https://saroh.app as for help-own-domain-1. The Google field and the
 * Google Analytics dialog are typed into and never saved. */
const ST = '[data-section="search-and-tracking"]';
const ST_VERIFY = `${ST} [data-verification-codes]`;
const ST_TRACKERS = `${ST} .wk-surface:has(h3:text-is("Your trackers"))`;
/** Tall enough that the section, near the page's foot, is laid out in view. */
const ST_DESK: Viewport = { width: 1280, height: 4800 };
/** A merchant's site at a desk, its cookie notice at the foot. */
const HELP_DESK_SITE: Viewport = { width: 1024, height: 640 };

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
        mark: '[data-rule="bookingPayment"]',
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
        mark: `a[href="${KAVI_ROOT_CANAL}"]`,
        alt: "Services at Kavi Dental (demo clinic): a row each, with its length, price and who takes it, and the root canal's row marked",
        caption: "Services at Kavi Dental, with the root canal's row",
    },
    {
        key: "help-take-deposit-2",
        business: "kavi",
        role: "owner",
        route: KAVI_ROOT_CANAL,
        viewport: { width: 1280, height: 1400 },
        clip: { selector: KAVI_PRICE, pad: 12 },
        mark: 'section:has(h2:text-is("Price")) [role="radio"][aria-checked="true"]',
        alt: "The root canal's price at Kavi Dental (demo clinic), with At booking, they pay set to a 50% deposit, what that means, and the note that it's paid at the desk for now, as no payment provider is connected",
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
        mark: 'button:text-is("Save")',
        alt: "The root canal at Kavi Dental (demo clinic) with a change not saved yet, and Save at the top right",
        caption: "A change to the root canal, waiting for Save",
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
        mark: 'aside[aria-label="Your booking"] div:has(> span:text-is("Pay at the desk"))',
        alt: "The booking summary on the site of Kavi Dental (demo clinic), with the root canal paid at the desk, as no payment provider is connected",
        caption:
            "Kavi Dental's booking page, with the deposit paid at the desk",
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
        // A draft is in the Plans list's Drafts view, and Edit is in its
        // row's menu.
        route: "/billing/subscriptions?tab=plans&view=drafts",
        viewport: { width: 1024, height: 560 },
        steps: [
            {
                click: 'button[aria-label="More actions for Packing supplies, monthly"]',
            },
            { click: '[role="menuitem"]:has-text("Edit")' },
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
        mark: 'button:has-text("Try again with a new pay link")',
        alt: "Arjun Mehta's subscription at Rye & Co. (demo bakery): a renewal not paid, with Try again with a new pay link",
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
            { click: `${DOMAIN} button:text-is("Add domain")` },
            { waitFor: '[role="dialog"] #add-domain-field' },
            {
                fill: '[role="dialog"] #add-domain-field',
                value: "www.northwindsupply.in",
            },
            { click: '[role="dialog"] h2' },
        ],
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] button:text-is("Add domain")',
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
        route: `${NW_SETTINGS}?section=search-and-sharing`,
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
        route: `${NW_SETTINGS}?section=search-and-sharing`,
        viewport: { width: 1280, height: 3000 },
        steps: [
            { click: `${SHARE} button:text-is("Add")` },
            { waitFor: '[role="dialog"] #settings-image-field' },
        ],
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] button:has-text("Choose a photo")',
        alt: "Adding a social share image at Northwind Supply (demo store): Choose a photo, or paste an image address, then Save",
        caption: "Adding a share image at Northwind Supply",
    },
    {
        key: "help-share-image-3",
        business: "northwind",
        role: "owner",
        route: `${NW_SETTINGS}?section=search-and-sharing`,
        viewport: { width: 1280, height: 3000 },
        steps: [
            {
                click: `#settings-description button:is(:text-is("Edit"), :text-is("Write"))`,
            },
            { waitFor: '[role="dialog"] #settings-description-field' },
            {
                fill: '[role="dialog"] #settings-description-field',
                value: "Packaging, cleaning and workshop supplies for small manufacturers in Peenya, Bengaluru. Order by phone or online.",
            },
            { click: '[role="dialog"] h2' },
        ],
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] #settings-description-field',
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

    // ── Verify your site and add analytics (Northwind) ────────────────
    {
        key: "help-verify-analytics-1",
        business: "northwind",
        role: "owner",
        route: `${NW_SETTINGS}?section=tracking`,
        viewport: ST_DESK,
        steps: [OPEN_CODES],
        clip: { selector: ST_VERIFY, pad: 12 },
        mark: "#tracking-title",
        alt: "Search and tracking in the website settings of Northwind Supply (demo store): its live address, its sitemap and the verification fields",
        caption: "Search and tracking at Northwind Supply",
    },
    {
        key: "help-verify-analytics-2",
        business: "northwind",
        role: "owner",
        route: `${NW_SETTINGS}?section=tracking`,
        viewport: ST_DESK,
        steps: [
            OPEN_CODES,
            { click: '[data-verification="google"] button:text-is("Add")' },
            { waitFor: '[role="dialog"] input' },
            {
                fill: '[role="dialog"] input',
                value: '<meta name="google-site-verification" content="northwind-demo-search-console-code" />',
            },
        ],
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] button:text-is("Save")',
        alt: "The Google Search Console field at Northwind Supply (demo store), with Google's HTML tag pasted and the code found in it",
        caption: "Google's tag pasted in at Northwind Supply",
    },
    {
        key: "help-verify-analytics-3",
        business: "northwind",
        role: "owner",
        route: `${NW_SETTINGS}?section=tracking`,
        viewport: ST_DESK,
        steps: [OPEN_CODES],
        clip: {
            selector: `${ST_VERIFY} div.grid:has([data-live-address])`,
            until: `${ST_VERIFY} div.grid:has([data-sitemap])`,
            pad: 12,
        },
        mark: 'button[aria-label="Copy sitemap address"]',
        alt: "The live address and sitemap of Northwind Supply's site (demo store), each with Copy",
        caption: "Northwind Supply's sitemap address",
    },
    {
        key: "help-verify-analytics-4",
        business: "northwind",
        role: "owner",
        route: `${NW_SETTINGS}?section=tracking`,
        viewport: ST_DESK,
        clip: { selector: ST_TRACKERS, pad: 12 },
        mark: '[data-tracker="ga4"] button:text-is("Set up")',
        alt: "Your trackers at Northwind Supply (demo store): Google Analytics, Google Ads, Meta Pixel, PostHog, Microsoft Clarity, Plausible and Umami Cloud, each with Set up",
        caption: "Your trackers at Northwind Supply, none connected yet",
    },
    {
        key: "help-verify-analytics-5",
        business: "northwind",
        role: "owner",
        route: `${NW_SETTINGS}?section=tracking`,
        viewport: { width: 1280, height: 900 },
        steps: [
            { click: '[data-tracker="ga4"] button:text-is("Set up")' },
            { waitFor: '[role="dialog"] textarea' },
            { fill: '[role="dialog"] textarea', value: "G-NWDEMO2026" },
            { click: '[role="dialog"] h2' },
        ],
        clip: { selector: '[role="dialog"]' },
        mark: '[role="dialog"] button:has-text("Add to your site")',
        alt: "Connect Google Analytics at Northwind Supply (demo store): a Measurement ID typed in, the ID to save shown, and Add to your site",
        caption: "Connecting Google Analytics at Northwind Supply",
    },
    {
        // Needs Google Analytics connected on Northwind first (the banner
        // shows only while a tool that asks is on the site): connect
        // G-NWDEMO2026 through the API on the throwaway database, capture,
        // then remove it. help-verify-analytics-4 needs it removed.
        key: "help-verify-analytics-6",
        business: "northwind",
        role: "visitor",
        route: "site:/",
        viewport: HELP_DESK_SITE,
        steps: [{ waitFor: "[data-site-consent]" }],
        mark: '[data-site-consent] a:text-is("What they do")',
        alt: "The site of Northwind Supply (demo store) as a new visitor sees it, with the cookie notice at the foot: Reject, Accept and What they do",
        caption: "The cookie notice on Northwind Supply's site",
    },
];

/* Create your business. */

/**
 * The setup form, answered as a florist would, never created. Setup is a
 * stepper since 11 Oct 2026 (DEC-130): Continue opens the name step. The
 * shots below that clip "Its address on Saroh" and "Is it registered as a
 * company?" predate DEC-130 and are retaken with the Help article.
 */
const SETUP_FILLED: Step[] = [
    { waitFor: 'text="What are you setting up?"' },
    { click: '[role="radio"]:has-text("A business")' },
    { click: 'form button[type="submit"]' },
    { fill: 'input[autocomplete="organization"]', value: "Tulsi Florist" },
    { waitFor: 'text="Available. Your website will live here."' },
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

/** The GST row's Change, which opens its sheet. */
const GST_CHANGE = "#business-gst-edit";

/** In the GST row's sheet: GST switched on and a GSTIN typed, never saved. */
const GST_ON: Step[] = [
    { click: GST_CHANGE },
    { waitFor: '[role="dialog"]' },
    { click: '[role="dialog"] [role="switch"][aria-label="GST-registered"]' },
    {
        fill: '[role="dialog"] input[placeholder="29ABCDE1234F1ZW"]',
        value: "29AAGCN4821K1Z5",
    },
    // Out of the field, so its parts are checked as a whole.
    { click: '[role="dialog"] h2' },
];

const GSTIN_SHOTS: Shot[] = [
    {
        key: "help-add-gstin-1",
        business: "northwind",
        role: "owner",
        route: NW_TAX,
        viewport: HELP_DESK,
        mark: GST_CHANGE,
        alt: "Settings, Business, Tax and invoices at Northwind Supply (demo shop): not GST-registered yet, with the Change button on the GST row",
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
                '[role="dialog"] div.space-y-2:has(> div > button[role="switch"])',
            until: '[role="dialog"] div.space-y-2:has(> input[placeholder="29ABCDE1234F1ZW"])',
            pad: 14,
        },
        mark: '[role="dialog"] input[placeholder="29ABCDE1234F1ZW"]',
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
        // The sheet's own preview, which follows the draft; the page's
        // shows what is saved.
        clip: {
            selector: '[role="dialog"] aside[aria-label="How it prints"]',
            pad: 12,
        },
        mark: '[role="dialog"] aside[aria-label="How it prints"] span:text-is("Tax invoice")',
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
            { click: '[role="dialog"] button:text-is("UPI")' },
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

/* "Add sizes and options": Rye & Co.'s Product settings › Options and two
 * of its loaves, looked at only. The Rye & caraway loaf sells as itself, so
 * its Variants section shows Add variants; pressing it, picking sizes and
 * Add to list only stage rows in the page (Save variants is never pressed).
 * Edit on the Size option opens its sheet; a value typed there is never
 * added and the sheet is never saved (nothing reaches the catalogue until
 * Save). The Sourdough loaf's 400g is sold only Online, which "Sell it at"
 * shows. */
const RYE_OPTIONS = "/commerce/products/settings?tab=options";
const RYE_CARAWAY =
    "/commerce/products/seed_sc_rc_product_1/edit?storefront=seed_sc_rc_store";
const VARIANTS = 'section[aria-labelledby="sec-variants"]';
const CARAWAY_SIZES: Step[] = [
    { click: `${VARIANTS} button:has-text("Add variants")` },
    { click: '[aria-label="New variant size"]' },
    { click: '[role="option"]:has-text("800g")' },
    { click: `${VARIANTS} button:has-text("Add to list")` },
    { click: '[aria-label="New variant size"]' },
    { click: '[role="option"]:has-text("400g")' },
    {
        fill: '[aria-label="New variant price, blank uses the product\'s"]',
        value: "300",
    },
    // Out of the field, so no focus ring is in the picture.
    { click: `${VARIANTS} h2` },
];

const SIZES_SHOTS: Shot[] = [
    {
        key: "help-add-sizes-1",
        business: "rye",
        role: "owner",
        route: RYE_OPTIONS,
        viewport: { width: 1024, height: 900 },
        steps: [
            { waitFor: 'button[aria-label="Edit Size"]' },
            { click: 'button[aria-label="Edit Size"]' },
            { waitFor: 'input[aria-label="Add a value to Size"]' },
            { fill: 'input[aria-label="Add a value to Size"]', value: "1kg" },
        ],
        clip: { selector: '[role="dialog"]', pad: 12 },
        mark: 'input[aria-label="Add a value to Size"]',
        alt: "Product settings › Options at Rye & Co. (demo bakery): the Edit Size sheet with its values, and 1kg typed into the box for a new value",
        caption:
            "Editing Size at Rye & Co.: its values, and 1kg typed in to add",
    },
    {
        key: "help-add-sizes-2",
        business: "rye",
        role: "owner",
        route: RYE_CARAWAY,
        viewport: { width: 1280, height: 1000 },
        steps: [{ waitFor: `${VARIANTS} button:has-text("Add variants")` }],
        clip: { selector: VARIANTS, pad: 12 },
        mark: `${VARIANTS} button:has-text("Add variants")`,
        alt: "Variants for the Rye & caraway loaf at Rye & Co. (demo bakery): sold as itself, with the Add variants button",
        caption: "The Rye & caraway loaf, sold as itself, and Add variants",
    },
    {
        key: "help-add-sizes-3",
        business: "rye",
        role: "owner",
        route: RYE_CARAWAY,
        viewport: { width: 1280, height: 1200 },
        steps: CARAWAY_SIZES,
        clip: { selector: VARIANTS, pad: 12 },
        mark: `${VARIANTS} button:has-text("Add to list")`,
        alt: "Variants for the Rye & caraway loaf at Rye & Co. (demo bakery): customers choose by Size, 800g in the list, and 400g with its suggested SKU and own price ready to add",
        caption: "Choosing by Size: 800g in the list, 400g about to be added",
    },
    {
        key: "help-add-sizes-4",
        business: "rye",
        role: "owner",
        route: RYE_CARAWAY,
        viewport: { width: 1280, height: 1200 },
        steps: [
            ...CARAWAY_SIZES,
            { click: `${VARIANTS} button:has-text("Add to list")` },
            { waitFor: `${VARIANTS} button:has-text("Save variants")` },
        ],
        clip: { selector: VARIANTS, pad: 12 },
        mark: `${VARIANTS} button:has-text("Save variants")`,
        alt: "Variants for the Rye & caraway loaf at Rye & Co. (demo bakery): 800g and 400g in the list, not saved yet, with Discard and Save variants",
        caption: "Two sizes in the list, and Save variants",
    },
    {
        key: "help-add-sizes-5",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH,
        viewport: { width: 1280, height: 1200 },
        steps: [
            { click: `${VARIANTS} li:nth-of-type(2) button:has-text("More")` },
            { waitFor: `${VARIANTS} [role="group"][aria-label^="Where"]` },
        ],
        clip: { selector: VARIANTS, pad: 12 },
        mark: `${VARIANTS} [role="group"][aria-label^="Where"]`,
        alt: "Variants for the Sourdough loaf at Rye & Co. (demo bakery): the 400g opened, showing photo 2 when picked and sold only Online",
        caption: "The Sourdough loaf's 400g: its own photo, sold only Online",
    },
];

/* "Count and move stock": Rye & Co.'s Sell › Stock, looked at only. Rye
 * sells at Hill Road and Online, so Move stock is offered. Count stock
 * and the boxes typed into are the screen's own draft (Save count is
 * never pressed); the Move stock dialog is filled and never moved. The
 * Log's Moved entries are the seed's own move, from Hill Road to Online. */
const RYE_STOCK = "/commerce/stock";
const COUNTING: Step[] = [
    { click: 'button:has-text("Count stock")' },
    {
        fill: '[aria-label="Almond croissant Single counted at Hill Road"]',
        value: "12",
    },
    {
        fill: '[aria-label="Almond croissant Box of 4 counted at Hill Road"]',
        value: "4",
    },
    // Out of the box, so no focus ring is in the picture.
    { click: 'h1:text-is("Stock")' },
];

const STOCK_SHOTS: Shot[] = [
    {
        key: "help-count-stock-1",
        business: "rye",
        role: "owner",
        route: RYE_STOCK,
        viewport: HELP_DESK,
        mark: '[role="group"][aria-label="Which products"] a:has-text("Needs you")',
        alt: "Stock at Rye & Co. (demo bakery): a row per product and size, a column each for Hill Road and Online, and Record stock, Move stock and Count stock",
        caption: "Rye & Co.'s stock levels at Hill Road and Online",
    },
    {
        key: "help-count-stock-2",
        business: "rye",
        role: "owner",
        route: RYE_STOCK,
        viewport: { width: 1024, height: 900 },
        steps: COUNTING,
        clip: {
            selector: '[role="note"]:has-text("Counting.")',
            until: '[role="listitem"]:has-text("Cinnamon bun") >> nth=0',
            pad: 12,
        },
        mark: '[aria-label="Almond croissant Box of 4 counted at Hill Road"]',
        alt: "Counting at Rye & Co. (demo bakery): a box per shelf with what the log says under it; one count matches the log, one is 1 short of it",
        caption: "A count in progress: one matches the log, one is 1 under it",
    },
    {
        key: "help-count-stock-3",
        business: "rye",
        role: "owner",
        route: RYE_STOCK,
        viewport: HELP_DESK,
        steps: COUNTING,
        mark: 'button:has-text("Save count")',
        alt: "The count bar at Rye & Co. (demo bakery): 2 counted, 1 differs from the log, with Cancel and Save count",
        caption: "2 counted, 1 differs from the log, and Save count",
    },
    {
        key: "help-count-stock-4",
        business: "rye",
        role: "owner",
        route: RYE_STOCK,
        viewport: { width: 1024, height: 700 },
        steps: [
            { click: 'button:has-text("Move stock")' },
            { click: "#mv-what" },
            { click: '[role="option"]:has-text("Sourdough loaf 800g")' },
            { fill: "#mv-units", value: "4" },
            { click: '[role="dialog"] h2' },
        ],
        clip: { selector: '[role="dialog"]', pad: 12 },
        mark: '[role="dialog"] button:text-is("Move")',
        alt: "Move stock at Rye & Co. (demo bakery): 4 of the Sourdough loaf 800g from Hill Road to Online, with what each has",
        caption: "Moving 4 Sourdough loaves from Hill Road to Online",
    },
    {
        key: "help-count-stock-5",
        business: "rye",
        role: "owner",
        route: `${RYE_STOCK}?tab=log&kind=moved`,
        viewport: HELP_DESK,
        mark: '[role="group"][aria-label="Kind of change"] a:text-is("Moved")',
        alt: "The stock Log at Rye & Co. (demo bakery), showing moves: the Sourdough loaf 800g out of Hill Road and into Online",
        caption: "Rye & Co.'s Log, showing a move from Hill Road to Online",
    },
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

/* ── Share and posts (plan 2026-11-13-002, U4; board VFSocial) ─────────
 *
 * The Share button on a live product or service and its sheet, and Create
 * post. Opening the sheet, picking a card or a size and typing a headline
 * only change the page's own state: nothing is downloaded, shared or
 * saved. Needs Share on (`NEXT_PUBLIC_SHARE_POSTS`, unset reads on under
 * `next dev`) and the API's `SHARE_POSTS`. A phone's own share sheet is
 * the phone's, never captured: `sh-phone` is Saroh's sheet at phone width.
 */
const RYE_SOURDOUGH_PAGE =
    "/commerce/products/seed_sc_rc_product_0?storefront=seed_sc_rc_store";
/** The visible Share button: a product page draws a second one for phones. */
const OPEN_SHARE: Step[] = [
    { click: "button[data-share-item]:visible" },
    { waitFor: '[role="dialog"] [role="radiogroup"]' },
];
const PHONE: Viewport = { width: 390, height: 844 };

const SHARE_SHOTS: Shot[] = [
    {
        key: "sh-sheet",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH_PAGE,
        viewport: DESK,
        steps: [
            ...OPEN_SHARE,
            { click: '[role="dialog"] [data-card="price"]' },
            { waitFor: '[role="dialog"] img[data-preview]' },
        ],
        clip: { selector: '[role="dialog"]' },
        alt: "The Share sheet for the Sourdough loaf at Rye & Co. (demo bakery): the Price tag card in the bakery's look, its sizes, the caption and the ways to share it",
        caption:
            "The Share sheet for Rye & Co.'s Cardamom bun box: a large Price tag card in the bakery's brown and cream, four card styles, Post, Square and Story, an editable caption with the shop link, and Download image, Copy caption, Send on WhatsApp and Share on Facebook",
        gap: "The seed's Rye & Co. has no Cardamom bun box; the Sourdough loaf is shown.",
    },
    {
        key: "sh-button",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH_PAGE,
        // Taken at 900 wide, so the page lays out in about the width a
        // step's half draws it at, and cropped from the breadcrumb through
        // the photos: Share and "On the online shop" read at near full size
        // (owner, 14 Nov 2026).
        viewport: { width: 900, height: 1300 },
        clip: {
            selector: 'main nav[aria-label="Breadcrumb"]',
            until: 'main [role="tabpanel"] div.bg-card:has-text("Photos and videos")',
            pad: 12,
        },
        alt: "The Sourdough loaf's page at Rye & Co. (demo bakery), live on the shop, with the Share button beside QR",
        caption:
            "A live product page in Saroh, Cardamom bun box, with the Share button beside QR",
        gap: "The Sourdough loaf, not a Cardamom bun box.",
    },
    {
        // The same Sourdough loaf as the hero (owner, 14 Nov 2026: one
        // example through the page), its weekend offer on the Offer card.
        key: "sh-cards",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH_PAGE,
        viewport: DESK,
        steps: [
            ...OPEN_SHARE,
            { click: '[role="dialog"] button:has-text("Square")' },
            { click: '[role="dialog"] [data-card="offer"]' },
            { waitFor: '[role="dialog"] img[data-preview]' },
        ],
        clip: { selector: '[role="dialog"]' },
        alt: "Card styles for the Sourdough loaf at Rye & Co. (demo bakery) in the bakery's own look, the Offer card in Square",
        caption:
            "The Sourdough loaf's card styles in Rye & Co.'s colours, Square chosen, and the Offer card showing its weekend discount",
    },
    {
        key: "sh-phone",
        business: "rye",
        role: "owner",
        route: RYE_SOURDOUGH_PAGE,
        viewport: PHONE,
        steps: OPEN_SHARE,
        alt: "The Share sheet on a phone for the Sourdough loaf at Rye & Co. (demo bakery), with Share now",
        caption:
            "A phone share sheet with the Sourdough loaf's card in Rye & Co.'s colours, a note saying the caption is copied for Instagram, and Share now",
        gap: "The phone's own share sheet can't be captured; this is Saroh's sheet before Share now opens it.",
    },
    {
        key: "sh-post",
        business: "rye",
        role: "owner",
        route: "/social/new",
        viewport: DESK,
        steps: [
            { click: '[data-own-post] button:has-text("Text only")' },
            { waitFor: "[data-own-headline]" },
            {
                fill: "[data-own-headline]",
                value: "We're hiring a morning baker",
            },
            // Out of the field, so no focus ring is in the picture.
            { click: "main h1" },
        ],
        alt: "Create post at Rye & Co. (demo bakery): Text only, the headline We're hiring a morning baker, a link and the card drawn in the bakery's look",
        caption:
            "Create post with Text only chosen, the headline We're hiring a morning baker, a link to the Work with us page, and the card drawn in the bakery's green",
        gap: "The link is left as offered; the seed may have no Work with us page.",
    },
    {
        // Step 4's close-up of the hero's post, finished (owner, 14 Nov
        // 2026): narrower than DESK and cropped to the form and its card.
        key: "sh-post-card",
        business: "rye",
        role: "owner",
        route: "/social/new",
        viewport: { width: 1100, height: 1000 },
        steps: [
            { click: '[data-own-post] button:has-text("Text only")' },
            { waitFor: "[data-own-headline]" },
            {
                fill: "[data-own-headline]",
                value: "We're hiring a morning baker",
            },
            {
                fill: "[data-own-caption]",
                value: "Early starts, good pay and all the bread you can eat. Come and see us on Hill Road.",
            },
            { click: 'main [role="radiogroup"] label:has-text("Shop")' },
            // Out of the field, so no focus ring is in the picture.
            { click: "main h1" },
        ],
        clip: { selector: "[data-own-composer]", pad: 20 },
        alt: "A finished own post at Rye & Co. (demo bakery): the headline, a caption, the Shop link and its card in the bakery's look",
        caption:
            "Create post filled in: the headline We're hiring a morning baker, a short caption, the Shop link chosen, and the card drawn in the bakery's colours",
    },
];

/* ── AI apps (plan 2026-11-13-002, U3; board VFAiApps) ─────────────────
 *
 * Only Saroh's own screens: the AI app's chat and its Add a connector form
 * are another company's, drawn on the page or left out, never captured.
 * Both wait for state the showcase seed doesn't make, so each waits for a
 * control only the real screen has and fails rather than shoot the wrong
 * one (see `gap`). Read-only: the consent screen is shot before Allow, and
 * opening a connection's sheet only changes the page.
 */

/**
 * Ask AI (owner, 15 Nov 2026): Rye & Co. through the page, each shot a
 * conversation already asked on the capture database, opened from the
 * history list by its question; the capture never asks. Ask them first
 * (`gap`): "How did this week go, and which products sold the most?",
 * "Is hafte sabse zyada kya bika?" and "Change the Sourdough loaf's
 * description to: …", the change card left unconfirmed.
 */
const ASK_GAP =
    "Asked by hand on the capture database first (Anthropic key in .env.local), with the API's R2_PUBLIC_BASE_URL set so the product cards show photos.";
const openAsk = (question: string): Step[] => [
    {
        click: `nav[aria-label="Your conversations"] button:has-text("${question}")`,
    },
    { waitFor: 'button:has-text("Report this answer")' },
];
const ASK_PANE = 'section[aria-label="Ask AI"]';
const ASK_AI_SHOTS: Shot[] = [
    {
        key: "ask-hero",
        business: "rye",
        role: "owner",
        route: "/ask",
        // Tall enough that the question shows above the answer.
        viewport: { width: 1440, height: 1200 },
        steps: openAsk("How did this week go"),
        alt: "Ask AI at Rye & Co. (demo bakery) answering how the week went, with its best sellers as cards",
        caption:
            "Ask AI's page: How did this week go, and which products sold the most? Answered from the bakery's own orders, with the best sellers as product cards",
        gap: ASK_GAP,
    },
    {
        // The hero on a phone: the same answer as the app draws it there.
        key: "ask-hero-phone",
        business: "rye",
        role: "owner",
        route: "/ask",
        viewport: { width: 390, height: 844 },
        // A phone opens the list from the page's header.
        steps: [
            { click: 'button[aria-label="Your conversations"]' },
            ...openAsk("How did this week go"),
            // It opens at the answer's end; show the question and the words.
            { scrollTop: "#ask-ai-page .overflow-y-auto" },
        ],
        alt: "Ask AI on a phone at Rye & Co. (demo bakery), answering how the week went with its best sellers as cards",
        caption:
            "Ask AI on a phone: how the week went, answered from the bakery's own orders",
        gap: ASK_GAP,
    },
    {
        key: "ask-start",
        business: "rye",
        role: "owner",
        route: "/",
        viewport: { width: 1100, height: 900 },
        steps: [
            { click: 'header button:has-text("Ask AI")' },
            {
                waitFor:
                    'aside[aria-label="Ask AI"] button:has-text("Who hasn\'t paid")',
            },
        ],
        clip: { selector: 'aside[aria-label="Ask AI"]' },
        alt: "Ask AI at Rye & Co. (demo bakery) before a question, with ready questions",
        caption:
            "The Ask AI panel opened over Home: Ask about Rye & Co., and ready questions such as Who hasn't paid and Top products this month",
    },
    {
        key: "ask-answer",
        business: "rye",
        role: "owner",
        route: "/ask",
        viewport: { width: 1100, height: 1000 },
        steps: openAsk("Is hafte sabse zyada"),
        clip: { selector: ASK_PANE },
        alt: "Ask AI at Rye & Co. (demo bakery) answering a question in Hinglish, with the best sellers as cards",
        caption:
            "Is hafte sabse zyada kya bika? Answered in Hinglish from the bakery's own orders, with the week's best sellers as product cards",
        gap: ASK_GAP,
    },
    {
        key: "ask-confirm",
        business: "rye",
        role: "owner",
        route: "/ask",
        viewport: { width: 1100, height: 640 },
        steps: openAsk("Change the Sourdough"),
        clip: { selector: ASK_PANE },
        alt: "Ask AI at Rye & Co. (demo bakery): a change to the Sourdough loaf's description, as a card to check before it is saved",
        caption:
            "A change to the Sourdough loaf's description comes back as a card: the old words struck through, the new ones, and Change product or Cancel",
        gap: ASK_GAP,
    },
    {
        key: "ask-history",
        business: "rye",
        role: "owner",
        route: "/ask",
        viewport: { width: 1100, height: 900 },
        steps: [{ waitFor: 'nav[aria-label="Your conversations"] button' }],
        clip: {
            selector: 'nav[aria-label="Your conversations"] h1',
            until: 'nav[aria-label="Your conversations"] button:has-text("How did this week go")',
            pad: 20,
        },
        alt: "Ask AI's history at Rye & Co. (demo bakery)",
        caption:
            "Your conversations: each kept for 90 days and seen only by you, newest first",
        gap: ASK_GAP,
    },
];
const AI_APPS_SHOTS: Shot[] = [
    {
        key: "ai-hero",
        role: "visitor",
        route: "/",
        viewport: DESK,
        supplied:
            "Claude connected to Rye & Co. on saroh.io, asked to add a button to the home page as a draft; cropped to the request and the answer (15 Nov 2026)",
        alt: "Claude adding an Order tomorrow's sourdough button to the home page of Rye & Co. (demo bakery), saved as a draft",
        caption:
            "In Claude: add a button near the top of Rye & Co.'s home page that says Order tomorrow's sourdough. Claude, using Saroh, adds it as a draft visitors don't see yet and says where it sits",
    },
    {
        key: "ai-ask",
        role: "visitor",
        route: "/",
        viewport: DESK,
        supplied:
            "Claude connected to Rye & Co. on saroh.io, asked to mark an order ready for pickup; the request and the answer joined without the tool line, which shows internal ids (15 Nov 2026)",
        alt: "Claude marking a Rye & Co. (demo bakery) order ready for pickup and saying what is left to pack",
        caption:
            "In Claude: mark order 1067 as ready for pickup. Claude marks it ready, leaves the courier order alone, and says 13 orders are still to pack",
    },
    {
        key: "ai-connect",
        role: "visitor",
        route: "/",
        viewport: DESK,
        supplied:
            "Claude's Settings › Connectors › Add custom connector with Saroh's address, shot by the owner (14 Nov 2026)",
        alt: "Claude's Add custom connector form with the name Saroh and Saroh's address, https://mcp.saroh.in/mcp",
        caption:
            "An AI app's Add a connector form with the name Saroh and Saroh's MCP address filled in",
    },
    {
        key: "ai-consent",
        business: "rye",
        role: "owner",
        // Claude's own sign-in, as claude.ai starts it (its published client
        // document), through Pick a business to the consent page; shot before
        // Allow, so no code is issued. The challenge is a fixed, valid one: the
        // capture never trades a code.
        route: `api:/api/auth/oauth2/authorize?${new URLSearchParams({
            response_type: "code",
            client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
            scope: "saroh:read saroh:write offline_access",
            code_challenge: "p7ZuqXBBQMmAPxlhacRYlz9GkdSucYGHKSxCZ05PETA",
            code_challenge_method: "S256",
            state: "shots",
        }).toString()}&resource={mcp}`,
        viewport: DESK,
        steps: [
            { click: 'role=checkbox[name="Rye & Co."]' },
            { click: 'button:has-text("Continue")' },
            { waitFor: 'button:has-text("Don\'t allow")' },
        ],
        // The consent column alone: full page it was a small card in white.
        clip: { selector: "h1 >> xpath=..", pad: 32 },
        alt: "Saroh's sign-in for an AI app at Rye & Co. (demo bakery): the businesses it may use, and what it may and may not do",
        caption:
            "An AI app wants to use Saroh as you: two of three businesses ticked, what it may do and what it can't, and Allow",
        gap: "The seed's owner ticks Rye & Co. only, not two of three businesses.",
    },
    {
        key: "ai-activity",
        business: "rye",
        role: "owner",
        route: "/settings/developers/ai",
        viewport: DESK,
        steps: [
            { click: 'button[aria-label^="Open "]' },
            { waitFor: '[role="dialog"]' },
        ],
        // The connection's sheet alone; the page behind it is dimmed.
        clip: { selector: '[role="dialog"]' },
        alt: "AI assistants in Settings at Rye & Co. (demo bakery): a connected AI app and the changes it made",
        caption:
            "Settings › API and AI apps › AI assistants: Claude connected to two businesses, its last three changes, and Roll back site draft and Disconnect",
        gap: "The seed connects no AI app: run `pnpm --filter @saroh/e2e shots:connect-claude` and make a change or two through it first (see that script).",
    },
];

/** Home's "Use Saroh from Claude" notice: a moment, not what a step shows. */
const HIDE_AI_MOMENT: Step = { hide: '[data-moment="new-ai-apps"]' };
/** Home's desk layout; the phone one is in the page too, hidden. */
const HOME_DESK = '[data-home-layout="desk"]';

/**
 * A step's shot: the desk app with its full sidebar, 16:10 like the frame a
 * step draws it in, so nothing is cut (owner, 16 Nov 2026; was 900 × 1000).
 */
const STEP_VIEW: Viewport = { width: 1280, height: 800 };

export const SHOTS: Shot[] = [
    // ── Rye & Co. ──────────────────────────────────────────────────────
    {
        key: "s-home",
        business: "rye",
        role: "owner",
        route: "/",
        viewport: DESK,
        steps: [HIDE_AI_MOMENT],
        alt: "Home at Rye & Co. (demo bakery): what needs doing today, from late orders to a failed renewal",
        caption:
            "Home at Rye & Co.: nine things that need Priya, from late orders to a failed renewal",
        gap: 'The owner is "Demo", not Priya, and the list holds 18 things, not nine.',
    },
    // Billing's overdue step: Rye's own Home, the money rows opened.
    {
        key: "r-money",
        business: "rye",
        role: "owner",
        route: "/",
        viewport: STEP_VIEW,
        steps: [
            HIDE_AI_MOMENT,
            {
                click: `${HOME_DESK} [data-need-group]:has-text("unpaid on") button[aria-label="Show the rows"]`,
            },
        ],
        focus: `${HOME_DESK} [data-need-group]:has-text("unpaid on")`,
        alt: "Money to chase on the Home of Rye & Co. (demo bakery): overdue bills with Remind all, cheques waiting to clear and a failed renewal",
        caption:
            "Overdue bills with a reminder ready, cheques not yet in the bank, and a renewal to retry by pay link",
    },

    {
        // Billing's step 2: Rye's bread is nil-rated, so a bread-only bill
        // is a bill of supply (the same app rule as a clinic's).
        key: "r-supply",
        business: "rye",
        role: "owner",
        route: "/billing/invoices/seed_sc_rc_invoice_trade_13",
        viewport: STEP_VIEW,
        focus: '[aria-label$="as it prints"]',
        alt: "A bill of supply from Rye & Co. (demo bakery) for nil-rated sourdough loaves, with the exempt-supply line",
        caption:
            "Bread is exempt from GST, so a bill for bread alone is a bill of supply, worded as the law asks",
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
        viewport: STEP_VIEW,
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
        viewport: STEP_VIEW,
        // The invoice as it prints, without the page around it.
        focus: '[aria-label$="as it prints"]',
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
        viewport: STEP_VIEW,
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
        viewport: STEP_VIEW,
        alt: "Subscriptions at Rye & Co. (demo bakery) with one failed renewal flagged",
        caption: "Subscriptions at Rye & Co. with one failed renewal flagged",
    },
    {
        key: "s-billing",
        business: "rye",
        role: "owner",
        route: "/billing/invoices",
        viewport: STEP_VIEW,
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
        viewport: STEP_VIEW,
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
        viewport: STEP_VIEW,
        alt: "The product editor: name, link, price and category beside visibility, variants and stock",
        caption:
            "The product editor: name, address on the shop, price and category beside visibility, variants and stock",
    },
    {
        key: "p-site",
        business: "rye",
        role: "owner",
        // Rye's own shop page, as a customer sees it (15 Nov 2026: the seed
        // gives Rye a shop that sells from Online).
        route: "site:/shop",
        viewport: { width: 1100, height: 1000 },
        alt: "The shop of Rye & Co. (demo bakery) on its Saroh website: cakes and extras with photos and prices",
        caption:
            "The shop of Rye & Co. (demo bakery), built on Saroh: products with photos, sizes and prices",
    },
    {
        key: "p-stock",
        business: "rye",
        role: "owner",
        route: "/commerce/stock",
        viewport: STEP_VIEW,
        alt: "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
        caption:
            "Stock levels for each size at Hill Road and Online, with what can be sold and what's promised",
    },
    {
        key: "p-detail",
        business: "rye",
        role: "owner",
        route: "/commerce/products/seed_sc_rc_product_0",
        viewport: STEP_VIEW,
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
        // Insights' cards since the redesign (15 Nov 2026 retake).
        key: "i-compare",
        business: "northwind",
        role: "owner",
        route: "/analytics",
        viewport: STEP_VIEW,
        focus: '[data-testid="insights-suggestion"]',
        alt: "Insights at Northwind Supply (demo business): what to do next, a product selling less, with a button to open it",
        caption:
            "What to do next: one suggestion from the business's own sales, with the button that acts on it",
    },
    {
        key: "i-weeks",
        business: "northwind",
        role: "owner",
        route: "/analytics?tab=money",
        viewport: STEP_VIEW,
        alt: "Am I making more money? at Northwind Supply (demo business): the last 4 weeks against the 4 before, week by week",
        caption:
            "Am I making more money? Yes, with the weeks side by side against the 4 before",
    },
    {
        key: "i-store",
        business: "northwind",
        role: "owner",
        route: "/analytics?tab=sells",
        viewport: STEP_VIEW,
        alt: "What sells at Northwind Supply (demo business): the three best sellers with units and money",
        caption: "What sells most, with units sold and money taken",
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
        viewport: STEP_VIEW,
        alt: "The booking page of Pulse Fitness (demo gym), with services, classes and a summary",
        caption:
            "Pulse Fitness's booking page with services, courses and a summary",
    },
    {
        key: "g-courses",
        business: "pulse",
        role: "owner",
        route: "/courses",
        viewport: STEP_VIEW,
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
        viewport: STEP_VIEW,
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
    // Subscriptions follows Pulse Fitness (owner, 15 Nov 2026).
    {
        // Bookings' step 3: a block of personal training, one order of three visits.
        key: "g-ptblock",
        business: "pulse",
        role: "owner",
        route: "/commerce/orders/seed_sc_pulse_order_ptblock",
        viewport: STEP_VIEW,
        focus: 'section[aria-labelledby="od-visits"]',
        alt: "A personal training block at Pulse Fitness (demo gym): three sessions, the first attended and the second booked",
        caption:
            "A block of three personal training sessions, sold once: what's attended, what's booked and what's left",
    },
    {
        key: "g-subdetail",
        business: "pulse",
        role: "owner",
        route: "/billing/subscriptions",
        viewport: DESK,
        // The page's promise is "renewed on time": the active members, each
        // with their next renewal, not one failed payment (owner, 16 Nov 2026).
        steps: [
            { click: 'main button:has-text("Need you")' },
            { click: '[role="option"]:has-text("Active")' },
            { waitFor: 'main tr:has-text("Active")' },
            // Off the menu: no focus ring or hover left on the shot.
            { click: "main h1" },
        ],
        alt: "Active memberships at Pulse Fitness (demo gym), each with its next renewal and what it pays",
        caption:
            "Active memberships at Pulse, each renewing on its day, with what it pays",
    },
    {
        key: "g-plans",
        business: "pulse",
        role: "owner",
        route: "/billing/subscriptions",
        viewport: STEP_VIEW,
        steps: [{ click: 'main [role="tab"]:has-text("Plans")' }],
        alt: "The membership plans at Pulse Fitness (demo gym), each with its price and how often it renews",
        caption:
            "Pulse's three membership plans with their prices and how often they renew",
    },
    {
        key: "g-subs",
        business: "pulse",
        role: "owner",
        route: "/billing/subscriptions",
        viewport: STEP_VIEW,
        steps: [
            { click: 'main button:has-text("Need you")' },
            { click: '[role="option"]:has-text("All subscriptions")' },
            // Off the menu: no focus ring or hover left on the shot.
            { click: "main h1" },
        ],
        alt: "Memberships at Pulse Fitness (demo gym) with their next charge",
        caption: "Memberships at Pulse with their next charge",
    },
    {
        key: "g-billing",
        business: "pulse",
        role: "owner",
        route: "/billing/invoices",
        viewport: STEP_VIEW,
        alt: "Invoices at Pulse Fitness (demo gym), with the overdue ones flagged",
        caption: "Pulse Fitness's invoices with four overdue",
        gap: "The seed has 17 overdue, not four.",
    },
    {
        // Website's step 1: what Pulse entered in Saroh, as its site shows it.
        key: "g-site-train",
        business: "pulse",
        role: "owner",
        route: "site:/",
        viewport: { width: 1100, height: 1500 },
        clip: { selector: 'section:has(h2:text-is("Ways to train"))', pad: 0 },
        alt: "Ways to train on the site of Pulse Fitness (demo gym): its classes and memberships with their prices, read from Saroh",
        caption:
            "Pulse Fitness's site lists its ways to train with their prices, read from what it entered in Saroh",
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
        viewport: STEP_VIEW,
        alt: "A root canal at Kavi Dental (demo clinic): visit 1 attended, visit 2 booked, visit 3 still to book",
        caption:
            "Order #D301, a root canal: visit 1 attended, visit 2 today, visit 3 still to book",
        gap: "The order is #ORD-001 and visit 2 is booked for a coming day, not today.",
    },
    // Customers follows Kavi Dental (owner, 15 Nov 2026: the business that
    // shows every step's feature): Rahul's root canal, note and flags.
    // Dashboard follows Kavi Dental: its Home has today's people (15 Nov 2026).
    {
        key: "k-needs",
        business: "kavi",
        role: "owner",
        route: "/",
        viewport: STEP_VIEW,
        steps: [HIDE_AI_MOMENT],
        focus: `${HOME_DESK} section:has(h2:text-is("Needs you"))`,
        alt: "Needs you on the Home of Kavi Dental (demo clinic): unpaid bills, an enquiry to answer and what to set up, each with its button",
        caption:
            "Needs you at Kavi Dental: bills to chase, a patient's note to answer and what's left to set up",
    },
    {
        key: "k-today",
        business: "kavi",
        role: "owner",
        route: "/",
        viewport: STEP_VIEW,
        steps: [HIDE_AI_MOMENT],
        focus: `${HOME_DESK} section:has(h2:text-is("Today"))`,
        alt: "Today on the Home of Kavi Dental (demo clinic): the day's patients in order, with their dentist, how they pay and their flags",
        caption:
            "Today's patients in order, each with their dentist, how they pay and anything the team should know",
    },
    {
        key: "k-money",
        business: "kavi",
        role: "owner",
        route: "/",
        viewport: STEP_VIEW,
        steps: [
            HIDE_AI_MOMENT,
            {
                click: `${HOME_DESK} [data-need-group]:has-text("unpaid on") button[aria-label="Show the rows"]`,
            },
        ],
        focus: `${HOME_DESK} [data-need-group]:has-text("unpaid on")`,
        alt: "Unpaid bills on the Home of Kavi Dental (demo clinic): the overdue ones with Remind all",
        caption:
            "Overdue bills at Kavi Dental, each with how late it is and a reminder ready to send",
    },
    {
        key: "k-calendar",
        business: "kavi",
        role: "owner",
        route: "/calendar",
        viewport: STEP_VIEW,
        alt: "This month on the calendar at Kavi Dental (demo clinic), with each day's bookings and money",
        caption:
            "The month at Kavi Dental: each day's bookings and money in, out and due",
    },
    // Orders follows Kavi Dental: treatments sold as orders of several visits.
    {
        key: "k-orders",
        business: "kavi",
        role: "owner",
        route: "/commerce/orders",
        viewport: DESK,
        steps: [HIDE_AI_MOMENT],
        alt: "Orders at Kavi Dental (demo clinic): treatments of several visits, each with its next visit and how it's paid",
        caption:
            "Kavi Dental's orders: implants, braces, root canals and cleanings, each with where it's up to",
    },
    {
        key: "k-invoice",
        business: "kavi",
        role: "owner",
        route: "/billing/invoices/seed_sc_kavi_invoice_o_rahul_rct",
        viewport: STEP_VIEW,
        focus: '[aria-label$="as it prints"]',
        alt: "The bill for Rahul Verma's root canal from Kavi Dental (demo clinic): a bill of supply, as dental treatment is exempt from GST",
        caption:
            "The treatment's bill, made from the order: a bill of supply, as healthcare is exempt from GST",
    },
    {
        key: "k-visits",
        business: "kavi",
        role: "owner",
        route: "/commerce/orders/seed_sc_kavi_order_rahul_rct",
        viewport: STEP_VIEW,
        focus: 'section[aria-labelledby="od-visits"]',
        alt: "Rahul Verma's root canal at Kavi Dental (demo clinic): visit 1 attended, visit 2 booked, visit 3 still to book, with his latex allergy and blood thinners above",
        caption:
            "A three-visit root canal: what's attended, what's booked and what's left, with the patient's flags on top",
    },
    {
        key: "k-note",
        business: "kavi",
        role: "owner",
        route: "/customers/seed_sc_kavi_contact_rahul",
        viewport: STEP_VIEW,
        focus: 'section[aria-label="1 note from the booking page"]',
        alt: "A note Rahul Verma wrote when booking at Kavi Dental (demo clinic), ready to label Medical and add to Needs attention as sensitive",
        caption:
            "What a patient wrote when booking, matched to their record, to label and add where the team will see it",
    },
    {
        key: "k-flags",
        business: "kavi",
        role: "owner",
        route: "/customers/seed_sc_kavi_contact_rahul",
        viewport: STEP_VIEW,
        focus: 'section[aria-label="Needs attention"]',
        alt: "Needs attention on Rahul Verma's record at Kavi Dental (demo clinic): a latex allergy, and blood thinners marked Sensitive",
        caption:
            "Allergy and medical flags on the patient's record; the medical one is Sensitive, shown only to those allowed",
    },
    {
        key: "d-customer",
        business: "kavi",
        role: "owner",
        route: "/customers/seed_sc_kavi_contact_rahul",
        viewport: STEP_VIEW,
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
    ...SIZES_SHOTS,
    ...STOCK_SHOTS,
    ...SHARE_SHOTS,
    ...AI_APPS_SHOTS,
    ...ASK_AI_SHOTS,
];
