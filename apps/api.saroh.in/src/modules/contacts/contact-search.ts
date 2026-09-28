import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import {
    normaliseEmail,
    normalisePhone,
} from "../customer-workspace/duplicates";
import { contactEmailForDisplay } from "./contact-email";

/**
 * Find a customer by name or phone (E4): the one search behind the shared
 * customer picker, in New booking now and New order (B13) later. The app
 * sends what was typed and never normalises it; this does, with C2's
 * `duplicates.ts`, so bookings and orders can't drift.
 *
 * - **A name** matches when every word typed is part of the first or last
 *   name ("priya r" finds Priya Raman).
 * - **A phone** matches on its digits, four or more ("3210" finds
 *   +91 98765 43210). "+91 98765 43210" and "9876543210" find the same
 *   person: the typed number is also tried without its leading 91.
 * - **An email** (anything with an @) matches the start of the contact's
 *   email or their site account's. A reserved placeholder is never matched
 *   nor shown (`contact-email.ts`).
 * - **Nothing typed** lists the most recent.
 *
 * Results are ordered by the last booking or payment, most recent first,
 * then the newest contact. A contact a merge or a privacy removal retired
 * (`@removed.invalid`) is never found.
 */

type Db = typeof prisma;

/** How many a search returns unless asked for fewer. */
export const SEARCH_LIMIT = 8;
/** The most a caller may ask for. */
export const SEARCH_LIMIT_MAX = 20;
/** Longest query read; the rest is ignored. */
const QUERY_MAX = 100;
/** Fewest digits that search phones. */
const MIN_PHONE_DIGITS = 4;
/** At most this many name words are matched. */
const MAX_WORDS = 5;

/** What a typed query searches for. */
export interface SearchTerms {
    /** Name words, lower-cased. */
    words: string[];
    /** Digit runs a phone must contain: as typed, and without a leading 91. */
    digits: string[];
    /** The email's start, lower-cased. */
    email: string | null;
    /** Nothing was typed: list the most recent. */
    recent: boolean;
}

/** Why a result is the very person typed, for "add new" (C2's rules). */
export type ExactOn = "email" | "phone";

export interface ContactSearchResult {
    id: string;
    /** "First Last", or null when neither is known. */
    name: string | null;
    /** Never a placeholder: the contact's own, their account's, or null. */
    email: string | null;
    phone: string | null;
    /** The last booking or payment, ISO; null when there has been none. */
    lastSeenAt: string | null;
    /**
     * The whole query is this contact's email or phone, normalised as C2
     * pairs duplicates. A picker adding someone new uses it: a typed email
     * that is already a contact's picks that contact, and a phone warns.
     */
    exactOn: ExactOn[];
}

/** Read a typed query into what it searches for. Pure. */
export function searchTerms(query: string | null | undefined): SearchTerms {
    const text = (query ?? "").trim().slice(0, QUERY_MAX);
    if (!text) return { words: [], digits: [], email: null, recent: true };
    if (text.includes("@")) {
        return {
            words: [],
            digits: [],
            email: text.toLowerCase(),
            recent: false,
        };
    }
    const hasLetters = /\p{L}/u.test(text);
    const raw = text.replace(/\D/g, "");
    if (!hasLetters && raw.length >= MIN_PHONE_DIGITS) {
        const national = normalisePhone(text);
        return {
            words: [],
            digits: [...new Set([raw, ...(national ? [national] : [])])],
            email: null,
            recent: false,
        };
    }
    const words = hasLetters
        ? text.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS)
        : [];
    return { words, digits: [], email: null, recent: false };
}

/** A LIKE pattern that matches `value` literally. */
function literal(value: string): string {
    return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The WHERE clause for the terms, or null when nothing can match. */
function matchClause(terms: SearchTerms): Prisma.Sql | null {
    if (terms.recent) return Prisma.sql`TRUE`;
    if (terms.email) {
        const start = `${literal(terms.email)}%`;
        // A site account's placeholder is no email: its account's is.
        return Prisma.sql`((lower(c.email) LIKE ${start} AND lower(c.email) NOT LIKE '%@account.invalid' AND lower(c.email) NOT LIKE '%@phone.invalid') OR lower(a.email) LIKE ${start})`;
    }
    if (terms.digits.length > 0) {
        const patterns = terms.digits.map((d) => `%${literal(d)}%`);
        return Prisma.sql`regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') LIKE ANY (${patterns})`;
    }
    if (terms.words.length > 0) {
        const each = terms.words.map((w) => {
            const part = `%${literal(w)}%`;
            return Prisma.sql`(coalesce(c."firstName", '') ILIKE ${part} OR coalesce(c."lastName", '') ILIKE ${part})`;
        });
        return Prisma.join(each, " AND ");
    }
    return null;
}

interface Row {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    accountEmail: string | null;
    lastSeenAt: Date | null;
}

/** Why the whole query is this person. Pure. */
export function exactOn(
    query: string | null | undefined,
    contact: {
        email: string | null;
        accountEmail?: string | null;
        phone: string | null;
    },
): ExactOn[] {
    const out: ExactOn[] = [];
    const email = normaliseEmail(query);
    if (
        email &&
        (email === normaliseEmail(contact.email) ||
            email === normaliseEmail(contact.accountEmail))
    ) {
        out.push("email");
    }
    const phone = normalisePhone(query);
    if (phone && phone === normalisePhone(contact.phone)) out.push("phone");
    return out;
}

/** The search itself, on the caller's organization. */
export async function searchContacts(
    db: Db,
    organizationId: string,
    query: string | null | undefined,
    limit: number = SEARCH_LIMIT,
): Promise<ContactSearchResult[]> {
    const terms = searchTerms(query);
    const where = matchClause(terms);
    if (!where) return [];
    const take = Math.min(
        Math.max(Math.trunc(limit) || 1, 1),
        SEARCH_LIMIT_MAX,
    );

    const rows = await db.$queryRaw<Row[]>(Prisma.sql`
        SELECT c.id, c."firstName", c."lastName", c.email, c.phone,
               a.email AS "accountEmail",
               GREATEST(b.last, i.last) AS "lastSeenAt"
        FROM "Contact" c
        LEFT JOIN LATERAL (
            SELECT ca.email FROM "CustomerAccount" ca
            WHERE ca."contactId" = c.id AND ca.status IN ('ACTIVE', 'BLOCKED')
            LIMIT 1
        ) a ON TRUE
        LEFT JOIN LATERAL (
            SELECT max(bk."startAt") AS last FROM "Booking" bk
            WHERE bk."contactId" = c.id AND bk.status <> 'CANCELLED'
        ) b ON TRUE
        LEFT JOIN LATERAL (
            SELECT max(inv."paidAt") AS last FROM "Invoice" inv
            WHERE inv."contactId" = c.id AND inv."paidAt" IS NOT NULL
        ) i ON TRUE
        WHERE c."organizationId" = ${organizationId}
          AND lower(c.email) NOT LIKE '%@removed.invalid'
          AND ${where}
        ORDER BY "lastSeenAt" DESC NULLS LAST, c."createdAt" DESC, c.id
        LIMIT ${take}`);

    return rows.map((r) => ({
        id: r.id,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
        email: contactEmailForDisplay(r.email, r.accountEmail),
        phone: r.phone,
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
        exactOn: exactOn(query, r),
    }));
}
