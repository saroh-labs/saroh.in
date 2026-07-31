/**
 * The eight capability modules, mirroring the API's module registry
 * (`apps/api.saroh.in/src/modules/capabilities/module-registry.ts`).
 *
 * Descriptions are shortened for a marketing audience but must not claim
 * anything the registry does not — this list is the product, and a landing page
 * that oversells the module set is the fastest way to lose a trial. `needs`
 * mirrors the registry's real `dependencies`, which is the honest version of the
 * modularity story: the modules genuinely compose rather than merely coexisting.
 */
export interface MarketingModule {
    key: string;
    label: string;
    blurb: string;
    /** Modules that must be on first — from the registry's `dependencies`. */
    needs?: string[];
}

export const MODULES: readonly MarketingModule[] = [
    {
        key: "WEBSITE",
        label: "Website",
        blurb: "Pages, templates, forms and your own domain — your public presence.",
    },
    {
        key: "COMMERCE",
        label: "Commerce",
        blurb: "Catalog, inventory, carts and orders for selling products.",
    },
    {
        key: "APPOINTMENTS",
        label: "Appointments",
        blurb: "Services, availability and bookings for scheduled work.",
        needs: ["CRM"],
    },
    {
        key: "CRM",
        label: "CRM",
        blurb: "Contacts, leads, pipelines and activity — the customer core.",
    },
    {
        key: "PAYMENTS",
        label: "Payments",
        blurb: "Providers, checkout and reconciliation, once you are selling or booking.",
    },
    {
        key: "COMMUNICATIONS",
        label: "Communications",
        blurb: "Messages, delivery and consent across your connected providers.",
        needs: ["CRM"],
    },
    {
        key: "AUTOMATIONS",
        label: "Automations",
        blurb: "Trigger and action rules that cut the repetitive follow-up.",
        needs: ["CRM"],
    },
    {
        key: "INSIGHTS",
        label: "Insights",
        blurb: "Analytics across every module you have switched on.",
    },
];
