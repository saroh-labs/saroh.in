import { REMOVED_CUSTOMER_NAME } from "../customers/anonymise-customer";
import { contactRelations } from "./merge-plan";

/**
 * What removing a customer's details for a privacy request does (DEC-042,
 * C11), as pure rules: each relation to `Contact`'s rule, the refusals and
 * the words the dialog and the API say. No database here;
 * `privacy-removal.service.ts` reads, locks and writes.
 *
 * The person is anonymised in place, never deleted, so orders, invoices and
 * bookings keep their keys. What the law needs is kept (issued invoices with
 * their bill-to, an order's lines, amounts and GST place of supply); leads
 * and form entries are the CRM's and are left as they are (DEC-041).
 *
 * `merge.relations.spec.ts` reads the Prisma schema and fails when a
 * relation to `Contact` has no rule in {@link REMOVAL_RULES}, as it does for
 * a merge. `personal-data.ts` covers the personal fields that don't hang off
 * `Contact` (store customers, order delivery, message and review addresses).
 * `ClassWaitlistEntry` (A12) has its row: deleted, and a place held for
 * them passes to the next person (`bookings/waitlist-merge.ts`).
 */

export type RemovalRuleKind =
    /** A CRM record, left as it is (DEC-041, 2026-09-27). */
    | "kept-crm"
    /** Kept, and holds no personal values of its own. */
    | "kept"
    /** Kept as printed: the law needs the paper. */
    | "kept-as-printed"
    /** Deleted. */
    | "deleted"
    /** Future ones cancelled; every one's booker details blanked. */
    | "cancel-future-and-blank"
    /** Body and recipient replaced; delivery status kept, errors cleared. */
    | "scrub-message"
    /** The link deleted; the store customer anonymised unless shared. */
    | "unlink-and-anonymise"
    /** Refused while live; ended ones kept. */
    | "refuse-while-live"
    /** Deleted with its sessions and pending codes (ADR-011). */
    | "delete-account"
    /** Deleted with its messages (A13). */
    | "delete-thread"
    /** Cancelled at the provider first, then its display hint cleared (D20). */
    | "cancel-mandates";

export interface RemovalRule {
    kind: RemovalRuleKind;
    /** Why, in one line. */
    note: string;
}

/**
 * Every relation to `Contact`, keyed `Model.foreignKey`, and what a privacy
 * removal does with it. The contact's own row is anonymised.
 */
export const REMOVAL_RULES: Readonly<Record<string, RemovalRule>> = {
    "Lead.contactId": {
        kind: "kept-crm",
        note: "Leads are the CRM's records and stay as they are (DEC-041).",
    },
    "Submission.contactId": {
        kind: "kept-crm",
        note: "Form entries are the CRM's records and stay as they are (DEC-041).",
    },
    "Booking.contactId": {
        kind: "cancel-future-and-blank",
        note: "Future bookings are cancelled; every booking reads “Removed customer” and loses the booker's email, phone and note (default 26).",
    },
    "Message.contactId": {
        kind: "scrub-message",
        note: "Messages sent to them keep their status; the body and address are replaced and provider errors cleared.",
    },
    "Consent.contactId": {
        kind: "deleted",
        note: "What they agreed to hear goes with them.",
    },
    "CustomerIdentityLink.contactId": {
        kind: "unlink-and-anonymise",
        note: "The link goes; the store customer is anonymised unless another live contact is linked to it.",
    },
    "CustomerSubscription.contactId": {
        kind: "refuse-while-live",
        note: "Refused while one is live (default 25); ended ones are kept, holding no personal values.",
    },
    "Invoice.contactId": {
        kind: "kept-as-printed",
        note: "Issued invoices keep their bill-to: the law needs the paper.",
    },
    "PackPurchase.contactId": {
        kind: "kept",
        note: "Class packs are kept; they hold no personal values.",
    },
    "CourseEnrollment.contactId": {
        kind: "kept",
        note: "Enrolments are kept; they hold no personal values.",
    },
    "ContactNote.contactId": {
        kind: "deleted",
        note: "What the team wrote about them goes.",
    },
    "ContactAttention.contactId": {
        kind: "deleted",
        note: "Needs attention goes.",
    },
    "CustomerAccount.contactId": {
        kind: "delete-account",
        note: "Their site account goes, with its sessions and pending codes (ADR-011).",
    },
    "CustomerAccount.unlinkedFromContactId": {
        kind: "kept",
        note: "An account staff parted from them is someone else's; it keeps only the id.",
    },
    "Contact.mergedIntoId": {
        kind: "kept",
        note: "Tombstones merged into them hold ids only, and keep pointing here.",
    },
    "CustomerThread.contactId": {
        kind: "delete-thread",
        note: "Their message thread goes, with every message in it (A13).",
    },
    "ClassWaitlistEntry.contactId": {
        kind: "deleted",
        note: "Their places in line go; a place held for them passes to the next person (A12).",
    },
    "PaymentMandate.contactId": {
        kind: "cancel-mandates",
        note: "Autopay is cancelled at the provider before anything else, then its UPI handle or card digits are cleared (D20).",
    },
};

/** Relations to `Contact` a removal has no rule for: must be empty. */
export function unruledRemovalRelations(
    schema: string,
    rules: Readonly<Record<string, RemovalRule>> = REMOVAL_RULES,
): string[] {
    return contactRelations(schema).filter((key) => !(key in rules));
}

// ── What the records say afterwards ─────────────────────────────────────

/** A booking's booker, and Orders' customer, once their details are gone. */
export const REMOVED_NAME = REMOVED_CUSTOMER_NAME;

/** The body of a message that was sent to them. */
export const REMOVED_BODY = "Removed";

/** The name on a review they wrote. */
export const REVIEWER_NAME = "A customer";

// ── Refusals ────────────────────────────────────────────────────────────

/** Why a removal is refused; `autopay` comes from `payments/mandate-gate.ts`. */
export type RemovalRefusalReason =
    "open-order" | "live-subscription" | "autopay";

export interface RemovalRefusal {
    reason: RemovalRefusalReason;
    message: string;
}

/**
 * Refused while an order is open or a subscription is live (default 25):
 * the business finishes or cancels it first. Named, so the merchant knows
 * what to do.
 */
export function removalRefusals(input: {
    openOrders: number;
    /** The plan names of their live subscriptions. */
    livePlans: readonly string[];
}): RemovalRefusal[] {
    const refusals: RemovalRefusal[] = [];
    if (input.openOrders > 0) {
        refusals.push({
            reason: "open-order",
            message:
                input.openOrders === 1
                    ? "Finish or cancel their open order first"
                    : `Finish or cancel their ${input.openOrders} open orders first`,
        });
    }
    for (const plan of [...new Set(input.livePlans)].sort()) {
        refusals.push({
            reason: "live-subscription",
            message: `Cancel their ${plan} subscription first`,
        });
    }
    return refusals;
}

// ── What goes and what stays ────────────────────────────────────────────

/** What the removal deletes, blanks or cancels. */
export interface RemovalGoes {
    notes: number;
    attention: number;
    consents: number;
    /** Emails and WhatsApp messages sent to them. */
    messages: number;
    /** Messages in their account thread (A13). */
    threadMessages: number;
    /** Store customers anonymised (not those another contact shares). */
    storeRecords: number;
    /** Orders whose recipient and note are cleared. */
    ordersScrubbed: number;
    /** Future bookings cancelled. */
    bookingsCancelled: number;
    /** Bookings whose booker details are blanked. */
    bookings: number;
    reviews: number;
    /** Their site account, if any. */
    account: boolean;
    /** Autopay mandates not yet cancelled. */
    autopay: number;
}

/** What stays, kept for the business's records and the law. */
export interface RemovalStays {
    orders: number;
    invoices: number;
    leads: number;
    submissions: number;
    packs: number;
    subscriptions: number;
    courses: number;
}
