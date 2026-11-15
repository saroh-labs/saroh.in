import type { SiteLook } from "@saroh/marketing/kit/site-drawing";
import type { World, WorldBusiness } from "@saroh/marketing/world";

/**
 * saroh.tech's example world (DEC-221): the Global demo businesses from
 * `db:seed:global` (`packages/database/src/seed/global/data.ts`), the same
 * ones saroh.tech's screenshots are taken on, so a drawing and the shot
 * beside it agree. Names, prices, places and tax come from the seed; where
 * a drawing needs a fact the seed doesn't hold, it is marked "not in the
 * seed" and kept in this file only.
 *
 * Global launches on Free (DEC-211): no GST, UPI, Razorpay or Hinglish; the
 * money path names Stripe, and a plan line says "Free until paid plans
 * open" with "Tell me when", never Grow or Pro.
 */

const SANS = "var(--font-site-sans), ui-sans-serif, system-ui, sans-serif";

/**
 * The seed sets no theme, so Thistlewick's site wears the site renderer's
 * default look (`@saroh/site-blocks` site theme), with its body colour for
 * the muted words so they read.
 */
const DEFAULT_LOOK: SiteLook = {
    bg: "0 0% 100%",
    surface: "30 14% 95%",
    fg: "24 10% 10%",
    muted: "24 6% 34%",
    accent: "24 10% 10%",
    accentFg: "0 0% 100%",
    fontHeading: SANS,
    fontBody: SANS,
    headingWeight: 600,
    radius: 2,
};

/** Thistlewick Bakery (Madison, WI): the lead, a bakery as Rye & Co. is in India. */
const THISTLEWICK: WorldBusiness = {
    key: "thistlewick",
    trade: "bakery",
    name: "Thistlewick Bakery",
    kind: "bakery",
    // Not in the seed: its owner login is "Demo Owner". A first name for
    // the drawings only.
    owner: "Clara",
    place: "118 Sample Street, Madison, WI",
    site: "thistlewick-bakery.saroh.app",
    plan: "Free",
    tradePage: "/solutions/shops",
    look: DEFAULT_LOOK,
    orderRange: ["ORD-001", "ORD-048"],
    invoiceRange: ["INV-0001", "INV-0005"],
    customers: [
        {
            name: "Maya Thompson",
            note: "Allergic to sesame. Collects most Saturdays, prefers the darker bake. 8 orders",
        },
        { name: "Ben Carter", note: "5 orders" },
        { name: "Lucy Alvarez", note: "4 orders" },
        {
            name: "Cedar Cup Cafe",
            note: "A wholesale invoice: 30 large sourdough, 48 cinnamon buns, due in 14 days",
        },
    ],
    items: [
        {
            key: "sourdough",
            name: "Sourdough loaf",
            price: "$9.00",
            unit: "large",
        },
        {
            key: "sourdough-small",
            name: "Sourdough loaf",
            price: "$5.50",
            unit: "small",
        },
        { key: "cinnamon-bun", name: "Cinnamon bun", price: "$4.50" },
        {
            key: "cinnamon-six",
            name: "Cinnamon bun",
            price: "$24.00",
            unit: "six-pack",
        },
        { key: "focaccia", name: "Rosemary focaccia", price: "$8.00" },
        { key: "beans", name: "House blend beans, 12 oz", price: "$16.00" },
        {
            key: "truffle-cake",
            name: "Chocolate truffle cake",
            price: "$42.00",
            unit: "6 inch",
        },
        {
            key: "lemon-cake",
            name: "Lemon and blueberry cake",
            price: "$44.00",
        },
        { key: "walnut-cake", name: "Coffee and walnut cake", price: "$44.00" },
        {
            key: "fruit-cake",
            name: "Vanilla and seasonal fruit cake",
            price: "$40.00",
        },
    ],
};

const LARKSPUR: WorldBusiness = {
    key: "larkspur",
    trade: "salon",
    name: "Larkspur & Vane",
    kind: "salon",
    owner: "Imogen Vane",
    place: "14 Sample Yard, Bristol",
    site: "larkspur-and-vane.saroh.app",
    plan: "Free",
    look: DEFAULT_LOOK,
    customers: [
        {
            name: "Hannah Clarke",
            note: "Allergic to PPD: patch test before any colour. Books Thursdays after work. 9 visits",
        },
        { name: "George Whitlock", note: "6 visits" },
        { name: "Amelia Rowe", note: "5 visits" },
    ],
    items: [
        {
            key: "cut",
            name: "Cut and blow-dry",
            price: "£58.00",
            unit: "60 min",
        },
        { key: "blow", name: "Blow-dry", price: "£34.00" },
        { key: "gents", name: "Gents' cut", price: "£32.00" },
        { key: "roots", name: "Root colour", price: "£85.00" },
        { key: "balayage", name: "Balayage", price: "£165.00" },
    ],
};

const IRONVALE: WorldBusiness = {
    key: "ironvale",
    trade: "gym",
    name: "Ironvale Fitness",
    kind: "gym",
    owner: "Jordan Reyes",
    place: "2400 Sample Avenue, Denver, CO",
    site: "ironvale-fitness.saroh.app",
    plan: "Free",
    look: DEFAULT_LOOK,
    customers: [
        {
            name: "Alex Romero",
            note: "Old shoulder injury: scale overhead pressing. Training for a first 10K. 6 visits",
        },
        { name: "Nora Bennett", note: "4 visits" },
        { name: "Marcus Hale", note: "3 visits" },
    ],
    items: [
        { key: "pt", name: "Personal training", price: "$75.00" },
        { key: "assess", name: "Movement assessment", price: "$45.00" },
        {
            key: "strength",
            name: "Strength class",
            price: "$22.00",
            unit: "up to 12",
        },
        { key: "yoga", name: "Yoga flow", price: "$20.00", unit: "up to 14" },
    ],
};

export const WORLD: World = {
    edition: "global",
    // Thistlewick is closed on Mondays (the seed's hours), so its day is a Tuesday.
    today: "Tuesday 17 Nov 2026",
    date: "2026-11-17",
    hours: "Tuesday to Sunday, from 7 am. Closed Mondays.",
    money: {
        provider: "Stripe",
        method: "card",
        taxName: "Sales tax",
        taxLine: "5.5%",
        taxId: "00-0000000",
    },
    lead: THISTLEWICK,
    // No florist in the Global seed: ?trade=florist shows the bakery.
    others: [LARKSPUR, IRONVALE],
};
