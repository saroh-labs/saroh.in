import type { OrgAction } from "./organization-policy";
import { ORG_ACTIONS } from "./organization-policy";

/**
 * Every permission, in the words a business owner would use to grant it.
 *
 * A business invents its own roles, and the person doing the inventing picks
 * the permissions from a list. That list is THIS one — the same closed set of
 * actions `authorize()` already decides with, so a role can never be given a
 * power the server does not enforce, and the server can never enforce a power
 * the screen did not offer.
 *
 * Which is the whole reason this file exists rather than the screen keeping
 * its own labels: two lists of permissions drift, and the drift is invisible
 * until a role quietly grants nothing, or grants more than it said.
 *
 * `ORG_ACTIONS` stays the source of truth for what exists. This adds only how
 * to SAY each one. `capability-catalogue.spec.ts` fails if an action is added
 * without a label, so the list cannot silently go stale.
 *
 * ## Groups
 *
 * Named for the part of the business, not for the API resource — an owner
 * looks for "Orders", not for `order:*`. A group maps to how the rail is
 * already grouped wherever it can.
 */
export const CAPABILITY_GROUPS = [
    "business",
    "team",
    "sell",
    "website",
    "contacts",
    "schedule",
    "money",
    "messaging",
    "insights",
] as const;

export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];

export interface Capability {
    action: OrgAction;
    group: CapabilityGroup;
    /** What granting it lets someone do, as a verb phrase. */
    label: string;
    /**
     * Present when the consequence is not obvious from the label — a power
     * that reaches further than it sounds, or one that is deliberately
     * narrower than its neighbour.
     *
     * SHOWN TO THE OWNER, verbatim. Merchant words only: an earlier note told
     * a shop owner to "see the annotations spec". The catalogue spec now
     * refuses code vocabulary here.
     */
    note?: string;
    /**
     * Cannot be granted to an invented role.
     *
     * Closing the business and handing over ownership stay with the built-in
     * Owner. A role that could grant itself `org:delete` would make the
     * "every business has exactly one person who can always get back in"
     * guarantee untrue.
     */
    ownerOnly?: boolean;
}

export const CAPABILITIES: readonly Capability[] = [
    // — Business —————————————————————————————————————————————
    { action: "org:read", group: "business", label: "See the business exists" },
    {
        action: "org:settings:read",
        group: "business",
        label: "See business details",
        note: "Legal name, tax ID and contact email. Seeing that the business exists does not include these.",
    },
    {
        action: "org:update",
        group: "business",
        label: "Change business details",
    },
    {
        action: "org:delete",
        group: "business",
        label: "Close the business",
        ownerOnly: true,
    },
    {
        action: "audit:read",
        group: "business",
        label: "Read the activity log",
        note: "Who did what, across the whole business.",
    },
    {
        action: "module:read",
        group: "business",
        label: "See which modules are on",
    },
    {
        action: "module:manage",
        group: "business",
        label: "Turn modules on and off",
        note: "Changes which rows everyone in the business sees in the sidebar.",
    },
    {
        action: "provider:read",
        group: "business",
        label: "See connected providers",
        note: "Names the services the business pays through.",
    },
    { action: "domain:manage", group: "business", label: "Manage domains" },
    {
        action: "automation:manage",
        group: "business",
        label: "Manage automations",
    },

    // — Team ——————————————————————————————————————————————————
    { action: "member:read", group: "team", label: "See who is in the team" },
    { action: "member:invite", group: "team", label: "Invite people" },
    { action: "member:remove", group: "team", label: "Remove people" },
    {
        action: "member:role:update",
        group: "team",
        label: "Change what a role can do",
        note: "Includes inventing roles. Someone with this can grant only what they hold themselves.",
    },
    {
        action: "project:access:manage",
        group: "team",
        label: "Manage project access",
    },

    // — Sell ——————————————————————————————————————————————————
    { action: "store:read", group: "sell", label: "See storefronts" },
    { action: "store:create", group: "sell", label: "Add a storefront" },
    { action: "store:write", group: "sell", label: "Change storefronts" },
    { action: "store:delete", group: "sell", label: "Delete a storefront" },
    {
        action: "inventory:write",
        group: "sell",
        label: "Count and move stock",
        note: "Counts shelves, records deliveries and waste, and moves stock between storefronts. Prices and names still need Change storefronts.",
    },
    {
        action: "order:read",
        group: "sell",
        label: "See orders",
        note: "The whole order: items, the customer, totals, payments and refunds.",
    },
    {
        action: "order:stage",
        group: "sell",
        label: "Move orders through their steps and print",
        note: "Sees what to make and who it is for, never what anyone paid.",
    },
    {
        action: "order:create",
        group: "sell",
        label: "Take new orders",
        note: "Includes walk-ins and a new order's payment link. Whoever can take, change, refund or export orders also sees them in full.",
    },
    {
        action: "order:edit",
        group: "sell",
        label: "Change orders after they're placed",
        note: "Items, address and how it's fulfilled, until it's handed over. Includes making a new payment link, which stops the old one.",
    },
    {
        action: "order:refund",
        group: "sell",
        label: "Refund and cancel orders",
        note: "Money goes back to the customer. Also settles the difference when a paid order changes.",
    },
    {
        action: "order:export",
        group: "sell",
        label: "Export orders",
        note: "A spreadsheet file of every order and who it was for leaves Saroh.",
    },
    {
        action: "order:write",
        group: "sell",
        label: "Take, change and export orders",
        note: "Kept for roles made before these were separate. It includes Take new orders, Change orders after they're placed and Export orders.",
    },
    { action: "discount:read", group: "sell", label: "See discount codes" },
    {
        action: "product-review:read",
        group: "sell",
        label: "See product reviews",
    },
    {
        action: "product-review:write",
        group: "sell",
        label: "Reply to, hide and invite product reviews",
        note: "Inviting emails a customer a link to review what they bought.",
    },
    {
        action: "discount:write",
        group: "sell",
        label: "Make and change discount codes",
        note: "Money off is money: whoever holds this can take it off any order they can create.",
    },

    // — Website ———————————————————————————————————————————————
    { action: "site:read", group: "website", label: "See websites" },
    { action: "site:create", group: "website", label: "Make a website" },
    { action: "site:update", group: "website", label: "Edit website pages" },
    { action: "site:delete", group: "website", label: "Delete a website" },
    { action: "site:publish", group: "website", label: "Publish a website" },
    {
        action: "site:comment",
        group: "website",
        label: "Leave notes on a website",
        note: "For someone checking the wording: they can comment without being able to change anything.",
    },
    { action: "site:approve", group: "website", label: "Sign a website off" },
    { action: "section:write", group: "website", label: "Edit page sections" },
    { action: "media:read", group: "website", label: "See the media library" },
    {
        action: "media:write",
        group: "website",
        label: "Upload and remove media",
    },
    { action: "form:read", group: "website", label: "See website forms" },
    { action: "form:write", group: "website", label: "Change website forms" },

    // — Contacts ——————————————————————————————————————————————
    {
        action: "contact:read",
        group: "contacts",
        label: "See customers and contacts",
        note: "Name, phone, email, address, notes and what the team must know. Search by any of them. Medical and other sensitive notes need their own permission.",
    },
    {
        action: "contact:write",
        group: "contacts",
        label: "Edit customers and contacts",
        note: "Details, notes and what the team must know. Includes deleting a record with no orders or invoices. Whoever can edit can also see.",
    },
    {
        action: "customer:sensitive",
        group: "contacts",
        label: "See sensitive notes",
        note: "Medical and other notes marked sensitive, and notes left when booking online. Without it, the team is told a note is there but not what it says.",
    },
    {
        action: "customer:merge",
        group: "contacts",
        label: "Merge duplicate customers",
        note: "A merge can't be undone. The customer kept takes every order, booking, invoice and note of the other, and can see them if they sign in on your website.",
    },
    {
        action: "customer:remove",
        group: "contacts",
        label: "Remove a customer's details",
        note: "For a privacy request. It can't be undone: their name, email, phone and address go from every order, booking and message. Invoices keep what was printed on them.",
    },
    { action: "lead:read", group: "contacts", label: "See leads" },
    { action: "lead:write", group: "contacts", label: "Add and edit leads" },
    { action: "pipeline:read", group: "contacts", label: "See the pipeline" },
    {
        action: "pipeline:manage",
        group: "contacts",
        label: "Change the pipeline",
    },
    {
        action: "activity:read",
        group: "contacts",
        label: "See contact activity",
    },
    {
        action: "activity:write",
        group: "contacts",
        label: "Log contact activity",
    },

    // — Schedule ——————————————————————————————————————————————
    { action: "booking:read", group: "schedule", label: "See bookings" },
    {
        action: "booking:write",
        group: "schedule",
        label: "Change bookings",
        note: "Book, check in, mark a no-show, move and cancel. Whoever can change bookings also sees them.",
    },
    { action: "service:read", group: "schedule", label: "See services" },
    {
        action: "service:write",
        group: "schedule",
        label: "Change services, hours, time off and booking rules",
        note: "Setting up how the business takes bookings, not the day's bookings. Whoever can change services also sees them.",
    },
    { action: "course:read", group: "schedule", label: "See courses" },
    {
        action: "course:write",
        group: "schedule",
        label: "Run courses and enrol people",
        note: "Enrolling books every session of the course for that person.",
    },
    {
        action: "pack:read",
        group: "schedule",
        label: "See class packs and who bought them",
        note: "The whole pack: who holds one, classes left, prices and every sale.",
    },
    {
        action: "pack:sell",
        group: "schedule",
        label: "Sell class packs and book with them",
        note: "Sells a pack at the desk and pays for a booking with one. Setting a pack's price or how long it lasts needs Make and change class packs.",
    },
    {
        action: "pack:write",
        group: "schedule",
        label: "Make and change class packs",
        note: "Prices, classes, how long they last, publishing, extending and archiving. Whoever can change packs can also sell them.",
    },

    // — Money —————————————————————————————————————————————————
    { action: "payment:read", group: "money", label: "See payments" },
    {
        action: "payment:manage",
        group: "money",
        label: "Manage payments",
        note: "Includes refunds.",
    },
    {
        action: "subscription:read",
        group: "money",
        label: "See memberships and plans, with what each owes",
    },
    {
        action: "subscription:write",
        group: "money",
        label: "Sign people up, pause and cancel memberships",
        note: "Each renewal bills the person again.",
    },
    { action: "invoice:read", group: "money", label: "See invoices" },
    {
        action: "invoice:write",
        group: "money",
        label: "Issue, void and mark invoices paid",
        note: "Marking an invoice paid records money that was never checked by Saroh.",
    },
    {
        action: "billing:read",
        group: "money",
        label: "See the Saroh plan and invoices",
    },
    {
        action: "billing:manage",
        group: "money",
        label: "Change the Saroh plan",
        note: "Changes what the business pays.",
    },

    // — Messaging —————————————————————————————————————————————
    { action: "message:read", group: "messaging", label: "See messages" },
    { action: "message:write", group: "messaging", label: "Send messages" },
    {
        action: "comms:manage",
        group: "messaging",
        label: "Manage messaging setup",
    },
    {
        action: "consent:read",
        group: "messaging",
        label: "See marketing consent",
    },
    {
        action: "consent:write",
        group: "messaging",
        label: "Change marketing consent",
        note: "Recording that a customer does or does not want marketing messages.",
    },
    {
        action: "notification:read",
        group: "messaging",
        label: "See notifications",
    },
    {
        action: "notification:write",
        group: "messaging",
        label: "Clear notifications",
    },

    // — Insights ——————————————————————————————————————————————
    { action: "analytics:read", group: "insights", label: "See insights" },
];

/** Lookup by action, for turning a stored grant back into its label. */
export const CAPABILITY_BY_ACTION: ReadonlyMap<OrgAction, Capability> = new Map(
    CAPABILITIES.map((c) => [c.action, c]),
);

/**
 * What an invented role may be granted.
 *
 * Everything except the powers reserved to the built-in Owner. Offered as a
 * function rather than a constant so the reservation is applied in one place
 * — a screen that filtered the list itself would be a second opinion about
 * who may close a business.
 */
export function grantableCapabilities(): readonly Capability[] {
    return CAPABILITIES.filter((c) => c.ownerOnly !== true);
}

/** Every action that exists, whether or not it is grantable. */
export function catalogueActions(): readonly OrgAction[] {
    return ORG_ACTIONS;
}
