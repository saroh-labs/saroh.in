import type { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { canSeeSensitive } from "../customer-workspace/attention-read";
import { allows } from "../organizations/organization-policy";
import type { WaitingThreads } from "../site-accounts/threads.service";
import type {
    HomeAction,
    HomeEvidence,
    HomeInput,
    HomeTone,
} from "./home-model";
import { EVIDENCE_LIMIT, personName } from "./home-model";

/**
 * Home's sources about people (round 2, F2): the customers waiting on the
 * business — a review with a low rating and no reply, a note left on the
 * booking page that staff haven't checked, a message nobody has answered.
 * Each is read on its own through `HomeService.attempt()`, and each asks
 * for the viewer's own read, so what a role can't read never reaches it,
 * not even as a count.
 */

type Db = typeof prisma;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A review at or below this rating waits for a reply on Home: the Home
 * design's rule, and the one that raises the review's "needs a reply"
 * notice when it arrives (`public-product-reviews.service.ts`).
 */
export const LOW_STAR_MAX = 3;

/** A note is "Before their visit" when the visit is this close. */
export const NOTE_SOON_MS = 2 * DAY_MS;

/** A message the team hasn't answered for this long is on Home. */
export const MESSAGE_WAIT_MS = HOUR_MS;

/** How much of a customer's words a row quotes. */
export const QUOTE_MAX = 140;

/** Where the "N more" rows about customers open the list of them. */
const CUSTOMERS_HREF = "/commerce/customers";

/** "“Loved it but…”", cut at a word when it runs over {@link QUOTE_MAX}. */
export function quote(text: string): string {
    const flat = text.replace(/\s+/g, " ").trim();
    const chars = [...flat];
    if (chars.length <= QUOTE_MAX) return `“${flat}”`;
    const cut = chars.slice(0, QUOTE_MAX - 1).join("");
    const space = cut.lastIndexOf(" ");
    return `“${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…”`;
}

/** "1 star", "3 stars". */
export function starsTag(rating: number): string {
    return `${rating} star${rating === 1 ? "" : "s"}`;
}

/**
 * How long a customer has waited for a reply: "Waiting · 3 h" within the
 * day, "Waiting · 2 days" after. Never "0 h": a message on Home has waited
 * an hour at least.
 */
export function waitingTag(since: Date, now: Date): string {
    const ms = now.getTime() - since.getTime();
    if (ms < DAY_MS) {
        return `Waiting · ${Math.max(1, Math.floor(ms / HOUR_MS))} h`;
    }
    const days = Math.floor(ms / DAY_MS);
    return `Waiting · ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * A customer's name, else their email — never a placeholder address, which
 * a site account's own record or a removed person carries.
 */
function customerName(contact: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}): string | null {
    return (
        personName({
            firstName: contact.firstName,
            lastName: contact.lastName,
        }) ?? contactEmailForDisplay(contact.email)
    );
}

/** The context the shared customer helpers read: the business and the viewer. */
export function viewerOf(input: HomeInput): OrganizationContext {
    return {
        organizationId: input.organizationId,
        userId: input.userId ?? "",
        role: input.organizationRole,
        actions: input.organizationActions,
    };
}

/**
 * Published reviews at {@link LOW_STAR_MAX} stars or fewer with no reply,
 * newest first: the newest is the one a reply still reaches in time. A
 * hidden review isn't on the site, so there is nobody to answer in public.
 * The caller has checked `product-review:read`.
 */
export async function lowStarReviews(
    db: Db,
    organizationId: string,
): Promise<HomeAction | null> {
    const where = {
        organizationId,
        status: "PUBLISHED",
        rating: { lte: LOW_STAR_MAX },
        reply: null,
    };
    const [count, rows] = await Promise.all([
        db.productReview.count({ where }),
        db.productReview.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: EVIDENCE_LIMIT,
            select: {
                id: true,
                rating: true,
                body: true,
                displayName: true,
                productName: true,
                productId: true,
                storeId: true,
                createdAt: true,
            },
        }),
    ]);
    if (count === 0) return null;

    const evidence: HomeEvidence[] = rows.map((r) => {
        const body = r.body?.trim();
        return {
            id: r.id,
            title: r.productName,
            subtitle: r.displayName.trim() || null,
            at: r.createdAt.toISOString(),
            amountMinor: null,
            currency: null,
            // The product's Reviews tab, where the reply is written; a
            // product since deleted leaves the business's list of them.
            href: r.productId
                ? `/commerce/products/${r.productId}?storefront=${r.storeId}&tab=reviews`
                : "/commerce/products?tab=reviews",
            tag: starsTag(r.rating),
            tone: "info",
            ...(body ? { detail: quote(body) } : {}),
        };
    });

    return {
        code: "COMMERCE_LOW_STAR_REVIEWS",
        title:
            count === 1
                ? "Answer 1 low-rated review"
                : `Answer ${count} low-rated reviews`,
        href:
            count === 1 && evidence[0]
                ? evidence[0].href
                : "/commerce/products?tab=reviews",
        severity: "OVERDUE",
        moduleKey: "COMMERCE",
        count,
        evidence,
    };
}

/**
 * Notes left on the booking page (C12) that wait on the customer's record
 * for staff to check, as suggestions. Only someone who can add them to the
 * record sees them (`contact:write`, as Customer Detail's card), and a
 * sensitive one only someone who may read sensitive entries — which every
 * booking-page note is until staff confirm it (default 95). What the viewer
 * can't see is left out of the rows and of the count alike.
 *
 * A note whose visit is within two days comes first, soonest visit first,
 * tagged "Before their visit"; the rest follow, oldest first.
 */
export async function bookingPageNotes(
    db: Db,
    viewer: OrganizationContext,
    now: Date,
): Promise<HomeAction | null> {
    if (!allows(viewer, "contact:write")) return null;
    const organizationId = viewer.organizationId;
    const base = {
        organizationId,
        source: "BOOKING_PAGE" as const,
        status: "SUGGESTED" as const,
        removedAt: null,
        // A merged-away person's entries live on under the survivor.
        contact: { mergedIntoId: null },
        ...(canSeeSensitive(viewer) ? {} : { sensitive: false }),
    };
    const soonVisit = {
        status: "CONFIRMED",
        startAt: {
            gte: now,
            lte: new Date(now.getTime() + NOTE_SOON_MS),
        },
    };
    const soon = { ...base, booking: soonVisit };
    const later = { ...base, NOT: { booking: soonVisit } };
    const select = {
        id: true,
        contactId: true,
        detail: true,
        label: true,
        createdAt: true,
        contact: { select: { firstName: true, lastName: true, email: true } },
        booking: { select: { startAt: true } },
    } as const;

    const [count, soonCount, soonRows] = await Promise.all([
        db.contactAttention.count({ where: base }),
        db.contactAttention.count({ where: soon }),
        db.contactAttention.findMany({
            where: soon,
            orderBy: [{ booking: { startAt: "asc" } }, { id: "asc" }],
            take: EVIDENCE_LIMIT,
            select,
        }),
    ]);
    if (count === 0) return null;
    const room = EVIDENCE_LIMIT - soonRows.length;
    const laterRows =
        room > 0 && count > soonRows.length
            ? await db.contactAttention.findMany({
                  where: later,
                  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  take: room,
                  select,
              })
            : [];

    const row = (r: (typeof soonRows)[number], before: boolean) => {
        const who = customerName(r.contact);
        const words = (r.detail ?? r.label).trim();
        return {
            id: r.id,
            title: who ?? "A customer",
            subtitle: who,
            at: (before && r.booking
                ? r.booking.startAt
                : r.createdAt
            ).toISOString(),
            amountMinor: null,
            currency: null,
            href: `/customers/${r.contactId}`,
            headline: `${who ?? "A customer"} left a note when booking`,
            ...(words ? { detail: quote(words) } : {}),
            tag: before ? "Before their visit" : "To check",
            tone: (before ? "due" : "info") as HomeTone,
        } satisfies HomeEvidence;
    };
    const evidence: HomeEvidence[] = [
        ...soonRows.map((r) => row(r, true)),
        ...laterRows.map((r) => row(r, false)),
    ];
    const hidden = count - evidence.length;

    return {
        code: "APPOINTMENTS_BOOKING_NOTES",
        title:
            count === 1
                ? "Check 1 note from the booking page"
                : `Check ${count} notes from the booking page`,
        href: count === 1 && evidence[0] ? evidence[0].href : CUSTOMERS_HREF,
        severity: "OVERDUE",
        moduleKey: "APPOINTMENTS",
        count,
        evidence,
        // "N more" ranks with a visit that's close, when it stands for one.
        ...(hidden > 0
            ? { moreTone: soonCount > soonRows.length ? "due" : "info" }
            : {}),
    };
}

/**
 * Customers waiting on a reply in their message thread (A13) for more than
 * {@link MESSAGE_WAIT_MS}, as `ThreadsService.waitingOnTeam` reads them,
 * the one who has waited longest first.
 */
export function unansweredMessages(
    waiting: WaitingThreads,
    now: Date,
): HomeAction | null {
    if (waiting.count === 0) return null;
    const evidence: HomeEvidence[] = waiting.threads.map((t) => {
        const who = t.name ?? "A customer";
        const more = t.messages > 1 ? `${t.messages} messages` : null;
        return {
            id: t.contactId,
            title: who,
            subtitle: t.name,
            at: t.since.toISOString(),
            amountMinor: null,
            currency: null,
            href: `/customers/${t.contactId}?tab=msg`,
            headline: `${who} is waiting for a reply`,
            detail: [quote(t.lastBody), more].filter(Boolean).join(" · "),
            tag: waitingTag(t.since, now),
            // Past a day, it has gone unanswered too long.
            tone: now.getTime() - t.since.getTime() >= DAY_MS ? "bad" : "due",
        };
    });
    const hidden = waiting.count - evidence.length;
    return {
        code: "CRM_UNANSWERED_MESSAGES",
        title:
            waiting.count === 1
                ? "Reply to 1 customer"
                : `Reply to ${waiting.count} customers`,
        href:
            waiting.count === 1 && evidence[0]
                ? evidence[0].href
                : CUSTOMERS_HREF,
        severity: "OVERDUE",
        moduleKey: "CRM",
        count: waiting.count,
        evidence,
        ...(hidden > 0
            ? { moreTone: waiting.longWaits > 0 ? "bad" : "due" }
            : {}),
    };
}
