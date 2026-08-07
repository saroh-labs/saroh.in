/**
 * The eight capability modules — the single source of marketing truth.
 *
 * Mirrors the API's module registry
 * (`apps/api.saroh.in/src/modules/capabilities/module-registry.ts`). `needs`
 * mirrors the registry's real `dependencies`: those are enforced by the product,
 * not a marketing device, which is the whole reason the dependency story is
 * worth telling. Nothing here may claim a capability the registry does not have.
 *
 * PRODUCT.md forbids reintroducing the "one customer record behind an order AND
 * a booking" claim: `Customer` is store-scoped and reconciliation to a `Contact`
 * is still manual (removed in commit 38b8b87). Do not add it back until
 * auto-linking ships.
 */

export interface MarketingModule {
    /** Registry key. Also the URL slug, lowercased. */
    key: string;
    slug: string;
    label: string;
    /** One line, used in the table and cards. */
    blurb: string;
    /** Modules that must be enabled first — the registry's real dependencies. */
    needs?: string[];
    /** The page's opening claim. One sentence, verifiable. */
    lede: string;
    /** What the module actually contains. Registry-backed nouns only. */
    inside: string[];
    /** A screenshot in /public/product, when one exists for this module. */
    shot?: { src: string; alt: string; caption: string };
}

export const MODULES: readonly MarketingModule[] = [
    {
        key: "WEBSITE",
        slug: "website",
        label: "Website",
        blurb: "Pages, templates, forms and your own domain.",
        lede: "Your public presence, built from the same workspace that runs the rest of the business.",
        inside: [
            "Pages built from templates",
            "Forms that create enquiries in CRM",
            "Your own domain",
            "Posts and post categories",
        ],
    },
    {
        key: "COMMERCE",
        slug: "commerce",
        label: "Commerce",
        blurb: "Catalog, inventory, carts and orders.",
        lede: "Sell products, with stock that moves when an order does.",
        inside: [
            "Products, variants and categories",
            "Inventory with reserve, commit and release",
            "Carts and orders",
            "Customers per store",
        ],
        shot: {
            src: "/product/home.png",
            alt: "Open orders ranked on Home, each showing how long it has waited",
            caption: "Open orders, ranked by how long they have waited",
        },
    },
    {
        key: "APPOINTMENTS",
        slug: "appointments",
        label: "Appointments",
        blurb: "Services, availability and bookings.",
        needs: ["CRM"],
        lede: "Offer services and let customers book time, against availability you control.",
        inside: [
            "Services and durations",
            "Availability rules",
            "Bookings with status",
            "A schedule of what is coming up",
        ],
        shot: {
            src: "/product/bookings.png",
            alt: "The bookings schedule",
            caption: "Appointments · Schedule",
        },
    },
    {
        key: "CRM",
        slug: "crm",
        label: "CRM",
        blurb: "Contacts, leads, pipelines and activity.",
        lede: "The customer core. Three other modules require it, because their work has to belong to somebody.",
        inside: [
            "Contacts",
            "Leads with value and stage",
            "Pipelines",
            "Tasks and activity",
        ],
        shot: {
            src: "/product/leads.png",
            alt: "The leads list",
            caption: "CRM · Leads",
        },
    },
    {
        key: "PAYMENTS",
        slug: "payments",
        label: "Payments",
        blurb: "Providers, checkout and reconciliation.",
        lede: "Connect a provider once, and take payment for orders and bookings alike.",
        inside: [
            "Provider credentials, encrypted at rest",
            "Checkout",
            "Reconciliation",
        ],
    },
    {
        key: "COMMUNICATIONS",
        slug: "communications",
        label: "Communications",
        blurb: "Messages, delivery and consent.",
        needs: ["CRM"],
        lede: "Send messages and follow-ups, with consent tracked against the contact.",
        inside: ["Messages", "Delivery status", "Consent tracking"],
    },
    {
        key: "AUTOMATIONS",
        slug: "automations",
        label: "Automations",
        blurb: "Trigger and action rules.",
        needs: ["CRM"],
        lede: "Cut the repetitive follow-up: when something happens, do the next thing.",
        inside: ["Trigger rules", "Actions", "Run history"],
    },
    {
        key: "INSIGHTS",
        slug: "insights",
        label: "Insights",
        blurb: "Analytics across every module you switched on.",
        lede: "Figures drawn from the modules you actually use — nothing invented for the ones you have not.",
        inside: ["Site and page analytics", "Activity over time"],
    },
];

export const MODULE_BY_SLUG = new Map(MODULES.map((m) => [m.slug, m]));

/** Label lookup so a dependency renders as "CRM", never a raw registry key. */
export const LABEL_BY_KEY = new Map(MODULES.map((m) => [m.key, m.label]));

/** The three that depend on something. Stated once, reused everywhere. */
export const DEPENDENT_MODULES = MODULES.filter((m) => m.needs?.length);
