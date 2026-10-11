/**
 * What `organization.retention.erase` removes from a deleted business, 180
 * days after it was deleted, and what it keeps (DEC-122, owner 10 Oct). Pure
 * rules; `retention-erase-writes.ts` writes them and
 * `organization-retention-erase.handler.ts` runs the chain.
 *
 * The Privacy Policy: "Access ends at once. We keep the account's data for
 * 180 days, as Indian law requires, then remove it from live systems." The
 * split between what goes and what stays is the privacy removal's
 * (`customer-workspace/privacy-removal-plan.ts`, DEC-042): a person is
 * anonymised in place so every key holds, and the paper the law needs is
 * kept as printed (ADR-008: invoices, credit notes and orders, eight
 * years). Two things differ, because here the whole business is gone:
 *
 * - what a single removal never reaches is erased too (a store customer no
 *   contact is linked to, a walk-in's name on an order);
 * - the CRM's records, which a removal leaves to the business (DEC-041),
 *   are scrubbed: no business is left to keep them.
 *
 * `retention-erase-plan.spec.ts` holds this file to the two registries it
 * builds on: every field `personal-data.ts` keeps and every relation
 * `REMOVAL_RULES` keeps needs a decision here, so a new "kept" there can't
 * silently survive a deleted business.
 */

export interface ErasedThing {
    /** What goes, in words. */
    what: string;
    /** How: `deleted`, `cleared` (set to nothing) or `replaced` (a fixed word). */
    how: "deleted" | "cleared" | "replaced";
}

/** Everything the eraser removes. The order is the order it runs in. */
export const RETENTION_ERASED: readonly ErasedThing[] = [
    {
        what: "Every uploaded file (photos, videos, documents): the object in storage, then its Media row",
        how: "deleted",
    },
    {
        what: "Class waitlist entries",
        how: "deleted",
    },
    {
        what: "Every customer (Contact): name, email (a placeholder), phone, company, address; with their notes, needs-attention entries, consents, message thread, site account, sessions and sign-in codes, and their autopay's UPI handle or card digits — the privacy removal's own rules, for every contact",
        how: "cleared",
    },
    {
        what: "Every customer a location holds (Customer): name, email (a placeholder), phone, country, state, city, postcode",
        how: "cleared",
    },
    {
        what: "On every order: the delivery name, phone, street, city and postcode, the free-text note, and a walk-in's name and phone",
        how: "cleared",
    },
    {
        what: "On every booking: the booker's name (reads “Removed customer”), email, phone and intake note, and the booker in its snapshot",
        how: "replaced",
    },
    {
        what: "Every message sent: its recipient (a placeholder), subject and body (reads “Removed”), and each delivery's provider error",
        how: "replaced",
    },
    {
        what: "Review invitations' address (a placeholder); every review's name (reads “A customer”), words and address, hidden",
        how: "replaced",
    },
    {
        what: "The CRM: every form entry's submitted values and hashed address, every lead's title (reads “Removed”), every lead activity's text",
        how: "cleared",
    },
    {
        what: "The team's inbox notices, open and settled invitations to the business and its locations, and the diary people's names (reads “Removed team member”) and titles",
        how: "deleted",
    },
    {
        what: "Detailed analytics events (visitor-level rows); the daily rollups stay",
        how: "deleted",
    },
];

export interface KeptThing {
    what: string;
    why: string;
}

/** Everything the eraser leaves, and why. */
export const RETENTION_KEPT: readonly KeptThing[] = [
    {
        what: "Invoices and credit notes with their lines, as printed (bill-to name, email and address; the seller's details; amounts and GST)",
        why: "Tax records, kept eight years (ADR-008).",
    },
    {
        what: "Orders and their lines: items, amounts, status, dates and the delivery state (the GST place of supply)",
        why: "Tax records, kept eight years (ADR-008).",
    },
    {
        what: "Payments, refunds and Saroh's own invoices to the business",
        why: "Tax and money records (ADR-008).",
    },
    {
        what: "Bookings' time, service and price; memberships, class packs and course enrolments",
        why: "They hold no personal values once the booker is blanked, and the orders and invoices point at them.",
    },
    {
        what: "Products, services, the website's pages and settings",
        why: "The catalogue an order's lines name; not personal data.",
    },
    {
        what: "The business's own name, legal name, address and GSTIN (Organization, BusinessProfile)",
        why: "The seller on its tax records.",
    },
    {
        what: "Memberships of the business (who was on its team, by user id)",
        why: "A person's Saroh sign-in is their own account, not the business's; the row holds ids only and the audit trails name them.",
    },
    {
        what: "Both audit trails (the business's history and the admin ledger)",
        why: "Records of what was done, kept with the business's record (DEC-021).",
    },
];

/** What the eraser does with something a privacy removal keeps. */
export interface KeptDecision {
    at180Days: "erased" | "kept";
    why: string;
}

/**
 * Every field `personal-data.ts` marks `kept`, keyed `Model.field`: whether
 * the eraser clears it once the business is gone.
 */
export const KEPT_FIELD_DECISIONS: Readonly<Record<string, KeptDecision>> = {
    "Order.deliveryState": {
        at180Days: "kept",
        why: "The GST place of supply; a state names no person.",
    },
    "Order.walkInName": {
        at180Days: "erased",
        why: "A person's name no removal reaches; the order's tax facts don't need it.",
    },
    "Order.walkInPhone": {
        at180Days: "erased",
        why: "A person's phone no removal reaches.",
    },
    "Order.courierName": {
        at180Days: "kept",
        why: "The courier company, not a person.",
    },
    "Invoice.billToName": {
        at180Days: "kept",
        why: "Printed on an issued invoice (ADR-008).",
    },
    "Invoice.billToEmail": {
        at180Days: "kept",
        why: "Printed on an issued invoice (ADR-008).",
    },
    "Invoice.billToAddress": {
        at180Days: "kept",
        why: "Printed on an issued invoice (ADR-008).",
    },
    "Invoice.sellerAddress": {
        at180Days: "kept",
        why: "The seller on a tax record.",
    },
    "Invoice.sellerName": {
        at180Days: "kept",
        why: "The seller on a tax record.",
    },
    "Invoice.sellerLegalName": {
        at180Days: "kept",
        why: "The seller on a tax record.",
    },
    "Invoice.sellerEmail": {
        at180Days: "kept",
        why: "The seller on a tax record.",
    },
    "ProductReview.productName": {
        at180Days: "kept",
        why: "A product's name, not a person's.",
    },
    "Activity.body": {
        at180Days: "erased",
        why: "Free text about a lead; no business is left to keep its CRM.",
    },
};

/**
 * Every relation to `Contact` a privacy removal keeps (`REMOVAL_RULES` kinds
 * `kept`, `kept-crm`, `kept-as-printed`, `refuse-while-live`), keyed
 * `Model.foreignKey`: what the eraser does with those rows.
 */
export const KEPT_RELATION_DECISIONS: Readonly<Record<string, KeptDecision>> = {
    "Lead.contactId": {
        at180Days: "erased",
        why: "The lead's title is replaced and its activity text cleared; the row stays for its keys.",
    },
    "Submission.contactId": {
        at180Days: "erased",
        why: "The submitted values and hashed address are cleared; the row stays for its keys.",
    },
    "CustomerSubscription.contactId": {
        at180Days: "kept",
        why: "Holds no personal values; its invoices point at it.",
    },
    "Invoice.contactId": {
        at180Days: "kept",
        why: "A tax record, kept as printed (ADR-008).",
    },
    "PackPurchase.contactId": {
        at180Days: "kept",
        why: "Holds no personal values; its order and invoice point at it.",
    },
    "CourseEnrollment.contactId": {
        at180Days: "kept",
        why: "Holds no personal values; its order and invoice point at it.",
    },
    "CustomerAccount.unlinkedFromContactId": {
        at180Days: "erased",
        why: "Every site account of the business is deleted, this one included.",
    },
    "Contact.mergedIntoId": {
        at180Days: "kept",
        why: "A tombstone holds ids only.",
    },
};

/** The removal rule kinds that leave rows as they are. */
export const KEEPING_RULE_KINDS: readonly string[] = [
    "kept",
    "kept-crm",
    "kept-as-printed",
    "refuse-while-live",
];

// ── What the records say afterwards ─────────────────────────────────────

/** A lead's title once the business's CRM is scrubbed. */
export const ERASED_LEAD_TITLE = "Removed";

/** A diary person's name once the business's team is scrubbed. */
export const ERASED_STAFF_NAME = "Removed team member";

/** The steps of one business's erase, in order. */
export type EraseStep =
    "media" | "waitlist" | "contacts" | "customers" | "records" | "analytics";

export const ERASE_STEPS: readonly EraseStep[] = [
    "media",
    "waitlist",
    "contacts",
    "customers",
    "records",
    "analytics",
];
