/**
 * saroh.tech's screenshots (global edition plan, U11): the Global demo
 * businesses from `db:seed:global`, taken by `capture.ts --edition=global`.
 * Keys are the ones saroh.tech's pages name, plus each key saroh.in's pages
 * use that Global can show, taken with India's crop and frame (`sameAs`,
 * DEC-221); the `l-` keys are the salon's.
 *
 * A person looks at every image: nothing checks pixels for ₹ or GST. The
 * businesses sit on paid plans (owner, 16 Nov 2026), so memberships and Ask
 * AI are taken too. A screen that still shows India's details, or a feature
 * no Global business can use (class packs, on no plan; online payments and
 * pay links, with no provider; India's GST bill of supply), isn't taken, and
 * its key stays in `apps/saroh.tech/content/shots.ts`'s PENDING_SHOTS.
 * Nothing is hidden from a shot.
 *
 * `d-customer` isn't taken: the note card says "for the team" to one person
 * (PENDING_SHOTS). Retake it when the app's words are fixed.
 *
 * Read-only, like every shot: nothing here saves. `alt` is true to the image
 * and names the business as a demo.
 */
import { morningZone } from "../../packages/database/src/seed/global/morning-zone";
import type { Shot, Step } from "./shots.config";
import { DESK, SHOTS } from "./shots.config";

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
    // Tall enough for a Home whose Needs you runs long (1,423px, 14 Nov 2026).
    viewport: { width: 1440, height: 1600 },
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

/**
 * India's spec for `key`, taken at Thistlewick Bakery: the same viewport,
 * steps and crop, so both editions' slot shows the same kind of image. `over`
 * names the business's own route, words and alt; India's `gap` is dropped.
 */
function sameAs(key: string, over: Partial<Shot> & { alt: string }): Shot {
    const india = SHOTS.find((s) => s.key === key);
    if (!india) throw new Error(`${key}: no India spec to match`);
    return {
        ...india,
        business: india.business && "thistlewick",
        gap: undefined,
        caption: over.alt,
        ...over,
    };
}

/* Share and posts: the Sourdough loaf, live on the Downtown shop. */
const SOURDOUGH_PAGE = `/commerce/products/${SHOP}_product_0?storefront=${SHOP}_store_main`;
const HIRING = "We're hiring a morning baker";
const SHARE_SHOTS: Shot[] = [
    sameAs("sh-sheet", {
        route: SOURDOUGH_PAGE,
        alt: "The Share sheet for the Sourdough loaf at Thistlewick Bakery (demo bakery): the Price tag card in the bakery's look, its sizes, the caption and the ways to share it",
    }),
    sameAs("sh-button", {
        route: SOURDOUGH_PAGE,
        alt: "The Sourdough loaf's page at Thistlewick Bakery (demo bakery), live on the shop, with the Share button beside QR",
    }),
    // The seed gives Thistlewick no discount, so there's no Offer card:
    // the Colour card in Square, in the same crop.
    sameAs("sh-cards", {
        route: SOURDOUGH_PAGE,
        steps: [
            { click: "button[data-share-item]:visible" },
            { waitFor: '[role="dialog"] [role="radiogroup"]' },
            { click: '[role="dialog"] button:has-text("Square")' },
            { click: '[role="dialog"] [data-card="colour"]' },
            { waitFor: '[role="dialog"] img[data-preview]' },
        ],
        alt: "Card styles for the Sourdough loaf at Thistlewick Bakery (demo bakery) in the bakery's own look, the Colour card in Square",
    }),
    sameAs("sh-phone", {
        route: SOURDOUGH_PAGE,
        alt: "The Share sheet on a phone for the Sourdough loaf at Thistlewick Bakery (demo bakery), with Share now",
    }),
    sameAs("sh-post", {
        alt: `Create post at Thistlewick Bakery (demo bakery): Text only, the headline ${HIRING}, a link and the card drawn in the bakery's look`,
    }),
    sameAs("sh-post-card", {
        steps: [
            { click: '[data-own-post] button:has-text("Text only")' },
            { waitFor: "[data-own-headline]" },
            { fill: "[data-own-headline]", value: HIRING },
            {
                fill: "[data-own-caption]",
                value: "Early starts, fair pay and all the bread you can eat. Come and see us Downtown.",
            },
            { click: 'main [role="radiogroup"] label:has-text("Shop")' },
            { click: "main h1" },
        ],
        alt: "A finished own post at Thistlewick Bakery (demo bakery): the headline, a caption, the Shop link and its card in the bakery's look",
    }),
];

/*
 * AI apps (every plan, Free too). The hero, the request and the connector
 * form are Claude's own screens, put in place by hand like India's.
 */
const AI_APPS_SHOTS: Shot[] = [
    sameAs("ai-hero", {
        supplied:
            "Claude connected to Thistlewick Bakery on the Global dev stack, asked to add an Order tomorrow's sourdough button to the home page as a draft; cropped to the request and the answer",
        alt: "Claude adding an Order tomorrow's sourdough button to the home page of Thistlewick Bakery (demo bakery), saved as a draft",
    }),
    sameAs("ai-ask", {
        supplied:
            "Claude connected to Thistlewick Bakery on the Global dev stack, asked to mark an order ready for pickup; the request and the answer, without the tool line",
        alt: "Claude marking a Thistlewick Bakery (demo bakery) order ready for pickup and saying what is left to pack",
    }),
    sameAs("ai-connect", {
        supplied:
            "Claude's Settings › Connectors › Add custom connector with saroh.tech's MCP address, shot by hand",
        alt: "Claude's Add custom connector form with the name Saroh and saroh.tech's address",
    }),
    sameAs("ai-consent", {
        steps: [
            { click: 'role=checkbox[name="Thistlewick Bakery"]' },
            { click: 'button:has-text("Continue")' },
            { waitFor: 'button:has-text("Don\'t allow")' },
        ],
        alt: "Saroh's sign-in for an AI app at Thistlewick Bakery (demo bakery): the businesses it may use, and what it may and may not do",
        gap: "The API sends the sign-in to its own accounts app; check the image shows saroh.tech's, not saroh.in's.",
    }),
    sameAs("ai-activity", {
        alt: "AI assistants in Settings at Thistlewick Bakery (demo bakery): a connected AI app and the changes it made",
        gap: "Connect Claude first: `pnpm --filter @saroh/e2e shots:connect-claude --edition=global`, then make a change or two through it.",
    }),
];

/*
 * Memberships, on the paid plans the demo businesses sit on (owner, 16 Nov
 * 2026): Ironvale's, and Thistlewick's Saturday loaves (`memberships` in the
 * Global seed). Class packs aren't offered on any plan (DEC-099): the app
 * hides the module, so `g-packs` stays pending.
 */
const MEMBERSHIP_SHOTS: Shot[] = [
    sameAs("r-subdetail", {
        route: `/billing/subscriptions/${SHOP}_sub_0`,
        alt: "Maya Thompson's weekly sourdough at Thistlewick Bakery (demo bakery): next charge, upcoming collections and changes",
    }),
    sameAs("s-subs", {
        alt: "Subscriptions at Thistlewick Bakery (demo bakery) with one failed renewal flagged",
    }),
    sameAs("g-subs", {
        business: "ironvale",
        alt: "Memberships at Ironvale Fitness (demo gym) with their next charge",
    }),
    sameAs("g-subdetail", {
        business: "ironvale",
        alt: "Active memberships at Ironvale Fitness (demo gym), each with its next renewal and what it pays",
    }),
    sameAs("g-plans", {
        business: "ironvale",
        alt: "The memberships Ironvale Fitness (demo gym) sells, each with its price and how often it renews",
    }),
];

/*
 * Ask AI (paying plans, DEC-220) at Thistlewick, in English: each shot a
 * conversation the Global seed writes already asked (`global/ask-ai.ts`),
 * opened from the history list by its question, as saroh.in's are; the
 * capture never asks, so no model key is needed.
 */
const HERO_Q = "How did the last seven days go";
const openAsk = (question: string): Step[] => [
    {
        click: `nav[aria-label="Your conversations"] button:has-text("${question}")`,
    },
    { waitFor: 'button:has-text("Report this answer")' },
];
const ASK_SHOTS: Shot[] = [
    sameAs("ask-hero", {
        steps: openAsk(HERO_Q),
        alt: "Ask AI at Thistlewick Bakery (demo bakery) answering how the last seven days went, with its best sellers as cards",
    }),
    sameAs("ask-hero-phone", {
        steps: [
            { click: 'button[aria-label="Your conversations"]' },
            ...openAsk(HERO_Q),
            { scrollTop: "#ask-ai-page .overflow-y-auto" },
        ],
        alt: "Ask AI on a phone at Thistlewick Bakery (demo bakery), answering how the last seven days went",
    }),
    sameAs("ask-start", {
        alt: "Ask AI at Thistlewick Bakery (demo bakery) before a question, with ready questions",
    }),
    sameAs("ask-answer", {
        steps: openAsk("Which products sold best"),
        alt: "Ask AI at Thistlewick Bakery (demo bakery) answering which products sold best this month, with the best sellers as cards",
    }),
    sameAs("ask-confirm", {
        steps: openAsk("Change the Sourdough"),
        alt: "Ask AI at Thistlewick Bakery (demo bakery): a change to the Sourdough loaf's description, as a card to check before it is saved",
    }),
    sameAs("ask-history", {
        clip: {
            selector: 'nav[aria-label="Your conversations"] h1',
            until: `nav[aria-label="Your conversations"] button:has-text("${HERO_Q}")`,
            pad: 20,
        },
        alt: "Ask AI's history at Thistlewick Bakery (demo bakery)",
    }),
];

const LISTED: Shot[] = [
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
        "/analytics",
        "Insights at Thistlewick Bakery (demo bakery): what to do next, from its own sales, with the button that acts on it",
        {
            viewport: { width: 1100, height: 1500 },
            clip: { selector: '[data-testid="insights-suggestion"]', pad: 8 },
        },
    ),

    shop(
        "i-weeks",
        "/analytics",
        "Am I making more money? at Thistlewick Bakery (demo bakery): the last 4 weeks against the 4 before",
        {
            viewport: { width: 1100, height: 1500 },
            clip: { selector: '[data-testid="answer-money"]', pad: 8 },
        },
    ),

    shop(
        "i-store",
        "/analytics",
        "What sells at Thistlewick Bakery (demo bakery): the best sellers with units and money",
        {
            viewport: { width: 1100, height: 1500 },
            clip: { selector: '[data-testid="answer-sells"]', pad: 8 },
        },
    ),

    shop(
        "t-invoice",
        `/billing/invoices/${SHOP}_invoice_order_0`,
        "An invoice made from an order at Thistlewick Bakery (demo bakery), in dollars, paid in full by card",
        invoicePaper,
    ),
    shop(
        "r-money",
        "/",
        "Unpaid invoices on the Home of Thistlewick Bakery (demo bakery): the overdue ones with Remind all",
        {
            viewport: { width: 1100, height: 1500 },
            steps: [
                { hide: '[data-moment^="new-"]' },
                {
                    click: '[data-home-layout="desk"] [data-need-group]:has-text("unpaid") button[aria-label="Show the rows"]',
                },
            ],
            clip: {
                selector:
                    '[data-home-layout="desk"] [data-need-group]:has-text("unpaid")',
                pad: 8,
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
    sameAs("p-site", {
        alt: "The shop of Thistlewick Bakery (demo bakery) on its Saroh website: breads, cakes and coffee with photos and prices",
    }),
    shop(
        "p-detail",
        `/commerce/products/${SHOP}_product_0`,
        "The Sourdough loaf's page at Thistlewick Bakery (demo bakery): what can be sold now, with open orders and the website",
        // Below the page's head, whose switch names the view.
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
        "g-ptblock",
        "site:/book",
        "The booking page of Ironvale Fitness (demo gym) with the Personal training block chosen: three sessions, booked one at a time",
        bookingPage("Personal training block"),
    ),
    gym(
        "g-site-train",
        "site:/",
        "Classes and coaching on the site of Ironvale Fitness (demo gym): its sessions and classes with their prices, read from Saroh",
        {
            viewport: { width: 1100, height: 1500 },
            clip: {
                selector: 'section:has(h2:text-is("Classes and coaching"))',
                pad: 0,
            },
        },
    ),
    gym(
        "g-site",
        "site:/",
        "The site of Ironvale Fitness (demo gym): what's on today and Book a free trial",
    ),

    // ── Wrenfield Dental ───────────────────────────────────────────────
    // Dashboard, Orders and Customers follow Wrenfield (owner, 15 Nov 2026).
    clinic(
        "k-needs",
        "/",
        "Needs you on the Home of Wrenfield Dental (demo clinic): unpaid invoices, a note to answer and what to set up",
        {
            viewport: { width: 1100, height: 1500 },
            steps: [{ hide: '[data-moment^="new-"]' }],
            clip: {
                selector:
                    '[data-home-layout="desk"] section:has(h2:text-is("Needs you"))',
                pad: 8,
            },
        },
    ),
    clinic(
        "k-today",
        "/",
        "Today on the Home of Wrenfield Dental (demo clinic): the day's patients in order, with their dentist and flags",
        {
            viewport: { width: 1100, height: 1500 },
            steps: [{ hide: '[data-moment^="new-"]' }],
            clip: {
                selector:
                    '[data-home-layout="desk"] section:has(h2:text-is("Today"))',
                pad: 8,
            },
        },
    ),
    clinic(
        "k-money",
        "/",
        "Unpaid invoices on the Home of Wrenfield Dental (demo clinic): the overdue ones with Remind all",
        {
            viewport: { width: 1100, height: 1500 },
            steps: [
                { hide: '[data-moment^="new-"]' },
                {
                    click: '[data-home-layout="desk"] [data-need-group]:has-text("unpaid") button[aria-label="Show the rows"]',
                },
            ],
            clip: {
                selector:
                    '[data-home-layout="desk"] [data-need-group]:has-text("unpaid")',
                pad: 8,
            },
        },
    ),
    clinic(
        "k-calendar",
        "/calendar",
        "This month on the calendar at Wrenfield Dental (demo clinic), with each day's bookings and money",
        {
            viewport: { width: 900, height: 1000 },
        },
    ),
    clinic(
        "k-orders",
        "/commerce/orders",
        "Orders at Wrenfield Dental (demo clinic): treatments of several visits, each with where it's up to",
        {
            steps: [{ hide: '[data-moment^="new-"]' }],
        },
    ),
    clinic(
        "k-visits",
        `/commerce/orders/${CLINIC}_order_daniel`,
        "Daniel's root canal at Wrenfield Dental (demo clinic): visits attended, booked and left, with his flags above",
        {
            viewport: { width: 1100, height: 1000 },
            clip: { selector: 'section[aria-labelledby="od-visits"]', pad: 8 },
        },
    ),
    clinic(
        "k-invoice",
        `/billing/invoices/${CLINIC}_invoice_treat_daniel`,
        "The invoice for a root canal at Wrenfield Dental (demo clinic), made from the order",
        invoicePaper,
    ),
    clinic(
        "d-customer",
        `/contacts/${CLINIC}_contact_daniel`,
        "Daniel's record at Wrenfield Dental (demo clinic): his flags, a note from the booking page and his visits",
        {
            viewport: { width: 900, height: 1000 },
        },
    ),
    clinic(
        "k-note",
        `/contacts/${CLINIC}_contact_daniel`,
        "A note Daniel wrote when booking at Wrenfield Dental (demo clinic), ready to label and add where you'll see it",
        {
            viewport: { width: 1100, height: 1000 },
            clip: {
                selector: 'section[aria-label$="from the booking page"]',
                pad: 8,
            },
        },
    ),
    clinic(
        "k-flags",
        `/contacts/${CLINIC}_contact_daniel`,
        "Needs attention on Daniel's record at Wrenfield Dental (demo clinic): an allergy, and a medical flag marked Sensitive",
        {
            viewport: { width: 1100, height: 1600 },
            clip: { selector: 'section[aria-label="Needs attention"]', pad: 8 },
        },
    ),
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
        { viewport: { width: 900, height: 1000 } },
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
    ...MEMBERSHIP_SHOTS,
    ...ASK_SHOTS,
    ...SHARE_SHOTS,
    ...AI_APPS_SHOTS,
];

/**
 * A key saroh.in takes as a feature step (the desk app at 1280 × 800, never
 * a one-panel crop) is taken the same way here: its viewport, its `focus`
 * and an Insights tab, with this edition's business and route (owner,
 * 16 Nov 2026, bugs #26–#30).
 */
function asIndiaStep(shot: Shot): Shot {
    const india = SHOTS.find((s) => s.key === shot.key);
    if (india?.viewport.width !== 1280 || india.viewport.height !== 800)
        return shot;
    const tab = /\?tab=\w+$/.exec(india.route)?.[0] ?? "";
    return {
        ...shot,
        viewport: india.viewport,
        clip: undefined,
        // Its own crop's target first: the same key can show another screen here.
        // An Insights tab is the whole step: nothing to scroll to.
        focus: tab
            ? undefined
            : (shot.focus ?? shot.clip?.selector ?? india.focus),
        route: tab && !shot.route.includes("?") ? shot.route + tab : shot.route,
    };
}

export const GLOBAL_SHOTS: Shot[] = LISTED.map(asIndiaStep);
