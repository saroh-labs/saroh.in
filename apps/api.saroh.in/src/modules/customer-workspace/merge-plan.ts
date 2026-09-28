import type { ContactEmailVerifiedVia } from "@saroh/database";

import type { ContactAddress } from "../contacts/contact-address";
import { ADDRESS_FIELDS, isEmptyAddress } from "../contacts/contact-address";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { maskEmail } from "../site-accounts/account-linking.service";

/**
 * What a merge of two customers does (DEC-042, C9), as pure rules: which
 * relation moves by which rule, the consent outcome, what happens to the
 * site account, the survivor's fields, and the refusals. No database here;
 * `merge.service.ts` reads, locks and writes.
 *
 * `merge.relations.spec.ts` reads the Prisma schema and fails when a
 * relation to `Contact` has no rule in {@link MERGE_RULES}, so a new table
 * that names a contact can't be forgotten. The rules for `CustomerThread`
 * (A13), `ClassWaitlistEntry` (A12) and `PaymentMandate` (D11) are in the
 * customers plan; whichever of those units lands after C9 adds its row here
 * and its move in the service:
 * - `CustomerThread`: the survivor's thread absorbs the other's messages in
 *   time order, and the other thread row is deleted;
 * - `ClassWaitlistEntry`: same class, the better place stays (OFFERED, then
 *   the earlier position); a second hold is released through
 *   `waitlist.offer`; different classes re-point;
 * - `PaymentMandate`: never moved; cancelled after commit through D20's
 *   `mandates.service.cancelFor({ contactId: other }, MERGED)` (the seam is
 *   `MergeService.afterCommit`).
 */

export type MergeSide = "survivor" | "other";

export type MergeRuleKind =
    /** Every row moves to the survivor. */
    | "repoint"
    /** Moves, except a row the survivor already has (the same store customer). */
    | "repoint-skip-duplicates"
    /** Moves; a row equal to one the survivor has is retired, not kept twice. */
    | "collapse-duplicates"
    /** One answer per channel: {@link consentOutcome}. */
    | "consent"
    /** Moves; refused while both hold a live subscription to the same plan. */
    | "refuse-same-live-plan"
    /** Moves; refused while both are actively enrolled in the same course. */
    | "refuse-same-active-course"
    /** ADR-011: {@link accountPlan}. */
    | "account"
    /** "This isn't them" follows the person to the survivor. */
    | "unlinked-from"
    /** Tombstones of the merged contact point at the survivor instead. */
    | "tombstones";

export interface MergeRule {
    kind: MergeRuleKind;
    /** Why, in one line. */
    note: string;
}

/**
 * Every relation to `Contact`, keyed `Model.foreignKey`, and how a merge
 * treats it. The merged contact's own row becomes the tombstone.
 */
export const MERGE_RULES: Readonly<Record<string, MergeRule>> = {
    "Lead.contactId": { kind: "repoint", note: "Their leads follow them." },
    "Submission.contactId": {
        kind: "repoint",
        note: "Form entries follow them.",
    },
    "Booking.contactId": {
        kind: "repoint",
        note: "Bookings follow them; the booker snapshot stays as booked.",
    },
    "Message.contactId": { kind: "repoint", note: "Messages follow them." },
    "Consent.contactId": {
        kind: "consent",
        note: "One per channel: the newer answer, never a lost opt-out.",
    },
    "CustomerIdentityLink.contactId": {
        kind: "repoint-skip-duplicates",
        note: "Store customers stay unmerged; their links move, once each.",
    },
    "CustomerSubscription.contactId": {
        kind: "refuse-same-live-plan",
        note: "Plans follow them; two live on one plan is refused (default 23).",
    },
    "Invoice.contactId": {
        kind: "repoint",
        note: "Invoices follow them; the bill-to stays as printed.",
    },
    "PackPurchase.contactId": {
        kind: "repoint",
        note: "Class packs follow them.",
    },
    "CourseEnrollment.contactId": {
        kind: "refuse-same-active-course",
        note: "Enrolments follow them; two active in one course is refused.",
    },
    "ContactNote.contactId": {
        kind: "repoint",
        note: "Notes follow them, both kept side by side (default 24).",
    },
    "ContactAttention.contactId": {
        kind: "collapse-duplicates",
        note: "Needs attention combines; an equal entry is kept once (default 24).",
    },
    "CustomerAccount.contactId": {
        kind: "account",
        note: "ADR-011: the survivor keeps its account; the other moves or retires.",
    },
    "CustomerAccount.unlinkedFromContactId": {
        kind: "unlinked-from",
        note: "An account staff parted from them stays parted from the survivor.",
    },
    "Contact.mergedIntoId": {
        kind: "tombstones",
        note: "Earlier tombstones point at the survivor, so a chain is one hop.",
    },
};

/**
 * Every foreign key to `Contact` in a Prisma schema's text, as
 * `Model.foreignKey` (the first column of a composite key). Read from the
 * schema file because the generated client's DMMF leaves out which side
 * of a relation holds the key.
 */
export function contactRelations(schema: string): string[] {
    const keys: string[] = [];
    const models = schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);
    for (const [, model, body] of models) {
        const relations = body.matchAll(
            /^\s*\w+\s+Contact\??\s+@relation\(([^)]*)\)/gm,
        );
        for (const [, args] of relations) {
            const fields = /fields:\s*\[\s*(\w+)/.exec(args);
            if (fields) keys.push(`${model}.${fields[1]}`);
        }
    }
    return keys.sort();
}

/** Relations to `Contact` a merge has no rule for: must be empty. */
export function unruledContactRelations(
    schema: string,
    rules: Readonly<Record<string, MergeRule>> = MERGE_RULES,
): string[] {
    return contactRelations(schema).filter((key) => !(key in rules));
}

// ── The people ──────────────────────────────────────────────────────────

export interface MergeContact extends ContactAddress {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    company: string | null;
    createdAt: Date;
    emailVerifiedAt: Date | null;
    emailVerifiedVia: ContactEmailVerifiedVia | null;
}

/** The account that signs in on the business's site (ACTIVE or BLOCKED). */
export interface MergeAccount {
    id: string;
    email: string;
}

/** The older contact is offered as the survivor (default 22). */
export function defaultSurvivor(a: MergeContact, b: MergeContact): string {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    if (t !== 0) return t < 0 ? a.id : b.id;
    return a.id < b.id ? a.id : b.id;
}

export function fullName(c: {
    firstName: string | null;
    lastName: string | null;
}): string | null {
    const name = [c.firstName, c.lastName]
        .map((p) => p?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    return name || null;
}

/**
 * The email a side offers: its own, or — for a placeholder (a site
 * account's separate contact) — its account's verified email. Never a
 * reserved placeholder.
 */
export function offeredEmail(
    contact: Pick<MergeContact, "email">,
    account: MergeAccount | null,
): string | null {
    return contactEmailForDisplay(contact.email, account?.email);
}

const sameEmail = (a: string | null, b: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
const samePhone = (a: string | null, b: string | null) =>
    digits(a).length > 0 && digits(a) === digits(b);

export interface FieldChoice {
    name: MergeSide;
    email: MergeSide;
    phone: MergeSide;
}

/** Both values of each field the merchant picks, as the design shows them. */
export interface FieldOptions {
    name: Record<MergeSide, string | null>;
    email: Record<MergeSide, string | null>;
    phone: Record<MergeSide, string | null>;
}

export function fieldOptions(
    survivor: MergeContact,
    other: MergeContact,
    accounts: Record<MergeSide, MergeAccount | null>,
): FieldOptions {
    return {
        name: { survivor: fullName(survivor), other: fullName(other) },
        email: {
            survivor: offeredEmail(survivor, accounts.survivor),
            other: offeredEmail(other, accounts.other),
        },
        phone: { survivor: survivor.phone, other: other.phone },
    };
}

/** The survivor's contact fields after the merge. */
export interface SurvivorFields extends ContactAddress {
    firstName: string | null;
    lastName: string | null;
    /** The email to hold; the survivor's own when neither side offers one. */
    email: string;
    phone: string | null;
    company: string | null;
}

function pick<T>(
    options: Record<MergeSide, T | null>,
    side: MergeSide,
): T | null {
    const other: MergeSide = side === "survivor" ? "other" : "survivor";
    // An empty pick never loses the value the other side has.
    return options[side] ?? options[other];
}

/**
 * Name, email and phone as picked (DEC-042, default 89); company and
 * address are the survivor's, filled from the other where the survivor has
 * none (R11). The address moves whole, never line by line: a survivor with
 * any line of its own keeps its own, so two addresses are never mixed.
 */
export function survivorFields(
    survivor: MergeContact,
    other: MergeContact,
    accounts: Record<MergeSide, MergeAccount | null>,
    choice: FieldChoice,
): SurvivorFields {
    const options = fieldOptions(survivor, other, accounts);
    const nameFrom =
        choice.name === "survivor" && fullName(survivor)
            ? survivor
            : choice.name === "other" && fullName(other)
              ? other
              : fullName(survivor)
                ? survivor
                : other;
    return {
        firstName: nameFrom.firstName,
        lastName: nameFrom.lastName,
        email: pick(options.email, choice.email) ?? survivor.email,
        phone: pick(options.phone, choice.phone),
        company: survivor.company?.trim()
            ? survivor.company
            : (other.company ?? null),
        ...addressOf(isEmptyAddress(survivor) ? other : survivor),
    };
}

function addressOf(c: ContactAddress): ContactAddress {
    return Object.fromEntries(
        ADDRESS_FIELDS.map((f) => [f, c[f] ?? null]),
    ) as ContactAddress;
}

// ── Consent ─────────────────────────────────────────────────────────────

export const CONSENT_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export interface ConsentAnswer {
    status: string; // GRANTED | REVOKED
    updatedAt: Date;
}

export interface ConsentOutcome {
    /** null: "not asked" until the person says yes again. */
    status: "GRANTED" | "REVOKED" | null;
    /** Whose record the answer comes from. */
    from: MergeSide | null;
}

/**
 * One channel's consent after a merge (default 24, DEC-042). The newer
 * answer wins, with two guards, because a consent row doesn't record the
 * address it was given for:
 * - a GRANTED counts only when the survivor keeps the address it came with
 *   (`keeps[side]`: the chosen email, or phone, was that side's); otherwise
 *   it is dropped;
 * - a REVOKED always counts, so an opt-out is never lost, and an older
 *   grant never replaces it.
 */
export function consentOutcome(
    answers: Partial<Record<MergeSide, ConsentAnswer>>,
    keeps: Record<MergeSide, boolean>,
): ConsentOutcome {
    const counted = (["survivor", "other"] as const)
        .map((side) => ({ side, answer: answers[side] }))
        .filter(
            (a): a is { side: MergeSide; answer: ConsentAnswer } =>
                !!a.answer &&
                (a.answer.status === "REVOKED" ||
                    (a.answer.status === "GRANTED" && keeps[a.side])),
        )
        .sort(
            (x, y) =>
                y.answer.updatedAt.getTime() - x.answer.updatedAt.getTime(),
        );
    if (counted.length === 0) return { status: null, from: null };
    const newest = counted[0];
    return {
        status: newest.answer.status === "GRANTED" ? "GRANTED" : "REVOKED",
        from: newest.side,
    };
}

/** Which side's address the survivor keeps, per channel. */
export function keptAddresses(
    survivor: MergeContact,
    other: MergeContact,
    accounts: Record<MergeSide, MergeAccount | null>,
    fields: Pick<SurvivorFields, "email" | "phone">,
): Record<ConsentChannel, Record<MergeSide, boolean>> {
    return {
        EMAIL: {
            survivor: sameEmail(
                fields.email,
                offeredEmail(survivor, accounts.survivor),
            ),
            other: sameEmail(fields.email, offeredEmail(other, accounts.other)),
        },
        WHATSAPP: {
            survivor: samePhone(fields.phone, survivor.phone),
            other: samePhone(fields.phone, other.phone),
        },
    };
}

// ── The site account (ADR-011) ──────────────────────────────────────────

export type AccountAction =
    /** Neither signs in. */
    | "none"
    /** The survivor keeps its account; the other had none. */
    | "keep"
    /** The other's account moves to the survivor. */
    | "move"
    /** The other's account is retired (MERGED) and stays on the tombstone. */
    | "retire";

export interface AccountPlan {
    action: AccountAction;
    /** The account that signs in on the survivor afterwards. */
    seesCombined: MergeAccount | null;
    /** The other's account, retired; its email stops reaching this record. */
    retired: MergeAccount | null;
    /** What the retired account points at (the survivor's), when any. */
    retiredInto: MergeAccount | null;
    /**
     * The merchant must tick "I've checked this email is theirs": an
     * account will see records it could not see before.
     */
    confirmationRequired: boolean;
}

/**
 * ADR-011 "Merging and removing". The survivor keeps its account. When it
 * has none, the other's moves to it — unless the merchant chose not to
 * carry the sign-in over. Otherwise the other's is retired. Two accounts
 * never end up on one contact.
 *
 * `otherBrings`: whether the other contact brings any record the
 * survivor's account couldn't see before.
 */
export function accountPlan(input: {
    survivor: MergeAccount | null;
    other: MergeAccount | null;
    carry: boolean;
    otherBrings: boolean;
}): AccountPlan {
    const { survivor, other, carry, otherBrings } = input;
    if (survivor) {
        return {
            action: other ? "retire" : "keep",
            seesCombined: survivor,
            retired: other,
            retiredInto: other ? survivor : null,
            confirmationRequired: otherBrings,
        };
    }
    if (!other) {
        return {
            action: "none",
            seesCombined: null,
            retired: null,
            retiredInto: null,
            confirmationRequired: false,
        };
    }
    if (carry) {
        // The moving account sees the survivor's whole record.
        return {
            action: "move",
            seesCombined: other,
            retired: null,
            retiredInto: null,
            confirmationRequired: true,
        };
    }
    return {
        action: "retire",
        seesCombined: null,
        retired: other,
        retiredInto: null,
        confirmationRequired: false,
    };
}

/**
 * The survivor's email is proven when it is the one its account signs in
 * with (DEC-049): staff confirming the merge stamp it STAFF_CONFIRMED.
 * Otherwise a stamp is kept only for the very address it was given for.
 */
export function survivorVerification(input: {
    email: string;
    account: MergeAccount | null;
    survivor: MergeContact;
    other: MergeContact;
    now: Date;
}): {
    emailVerifiedAt: Date | null;
    emailVerifiedVia: ContactEmailVerifiedVia | null;
} {
    const { email, account, survivor, other, now } = input;
    if (account && sameEmail(email, account.email)) {
        return { emailVerifiedAt: now, emailVerifiedVia: "STAFF_CONFIRMED" };
    }
    for (const side of [survivor, other]) {
        if (side.emailVerifiedAt && sameEmail(email, side.email)) {
            return {
                emailVerifiedAt: side.emailVerifiedAt,
                emailVerifiedVia: side.emailVerifiedVia,
            };
        }
    }
    return { emailVerifiedAt: null, emailVerifiedVia: null };
}

// ── Refusals ────────────────────────────────────────────────────────────

export interface MergeRefusal {
    reason: "same-plan" | "same-course";
    message: string;
}

/**
 * Refused while both hold a live subscription to the same plan (default
 * 23) or an active enrolment in the same course (default 90): one of them
 * is ended first. Named, so the merchant knows which.
 */
export function mergeRefusals(input: {
    samePlans: readonly string[];
    sameCourses: readonly string[];
}): MergeRefusal[] {
    return [
        ...input.samePlans.map((plan) => ({
            reason: "same-plan" as const,
            message: `Cancel one of their ${plan} subscriptions first`,
        })),
        ...input.sameCourses.map((course) => ({
            reason: "same-course" as const,
            message: `Cancel one of their ${course} enrolments first`,
        })),
    ];
}

// ── What moves ──────────────────────────────────────────────────────────

/** What the preview counts, and the merge reports, in the order shown. */
export const MOVE_KINDS = [
    ["orders", "order", "orders"],
    ["bookings", "booking", "bookings"],
    ["invoices", "invoice", "invoices"],
    ["subscriptions", "subscription", "subscriptions"],
    ["packs", "class pack", "class packs"],
    ["courses", "course enrolment", "course enrolments"],
    ["notes", "note", "notes"],
    ["attention", "Needs attention entry", "Needs attention entries"],
    ["messages", "message", "messages"],
    ["leads", "lead", "leads"],
    ["submissions", "form entry", "form entries"],
    ["links", "store record", "store records"],
] as const;

export type MoveKind = (typeof MOVE_KINDS)[number][0];

export interface MoveCount {
    key: MoveKind;
    count: number;
    /** "2 orders", "1 note". */
    label: string;
}

/** Name the counts, dropping kinds with nothing to move. */
export function moveCounts(
    counts: Partial<Record<MoveKind, number>>,
): MoveCount[] {
    return MOVE_KINDS.map(([key, one, many]) => {
        const count = counts[key] ?? 0;
        return { key, count, label: `${count} ${count === 1 ? one : many}` };
    }).filter((m) => m.count > 0);
}

/** The preview's words about the site account, per ADR-011. */
export function accountSentences(plan: AccountPlan): {
    seesCombined: string | null;
    stopsReaching: string | null;
} {
    return {
        seesCombined: plan.seesCombined
            ? `${maskEmail(plan.seesCombined.email)} signs in on your website and will see everything here`
            : null,
        stopsReaching: plan.retired
            ? plan.retiredInto
                ? `${maskEmail(plan.retired.email)} will be asked to sign in with ${maskEmail(plan.retiredInto.email)} instead`
                : `${maskEmail(plan.retired.email)} will no longer sign in to this record`
            : null,
    };
}
