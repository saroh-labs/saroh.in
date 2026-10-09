/**
 * The refusals a move to a lower plan gives (#800, `over-limit.ts`). Each
 * carries a stable `details.code` the apps branch on.
 *
 * - `PAUSED_BY_PLAN` (409), to the business: this product, post or person
 *   is past the plan's limit, so it is read-only. Says why and where to go.
 * - `NOT_TAKING_ORDERS` (409), to a customer: a location or website that
 *   stopped taking orders and bookings. Names no plan, limit or price, as
 *   `BOOKINGS_PAUSED` doesn't; the business hears why from its notice.
 * - `MEMBER_PAUSED` (403), to a team member past the limit: they can't
 *   open the business until it moves up again.
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";

export const PAUSED_BY_PLAN = "PAUSED_BY_PLAN";
export const NOT_TAKING_ORDERS = "NOT_TAKING_ORDERS";
export const MEMBER_PAUSED = "MEMBER_PAUSED";

/** What a paused thing is, in the business's words. */
export type PausedKind = "product" | "post" | "location" | "site";

const WHAT: Record<PausedKind, { one: string; why: string }> = {
    product: {
        one: "This product",
        why: "Your plan includes fewer products than you have, so your oldest are hidden from your site and read-only.",
    },
    post: {
        one: "This blog post",
        why: "Your plan includes fewer blog posts than you have, so your oldest are hidden from your site and read-only.",
    },
    location: {
        one: "This location",
        why: "Your plan includes fewer locations than you have, so the newest ones stopped taking orders. Stock and history are kept.",
    },
    site: {
        one: "This website",
        why: "Your plan includes fewer websites than you have, so the newest ones stopped taking orders and bookings.",
    },
};

/** The business's words for a paused thing: what, why, and the way back. */
export function pausedWords(kind: PausedKind): string {
    const w = WHAT[kind];
    return `${w.one} is paused. ${w.why} Choose a plan in Plan and billing to bring it back.`;
}

/** 409: a write to something paused by the plan (read-only). */
export function pausedByPlan(kind: PausedKind): ConflictException {
    return new ConflictException({
        message: pausedWords(kind),
        details: { code: PAUSED_BY_PLAN, kind },
    });
}

/** What a customer reads at a paused location or website. */
export const NOT_TAKING_ORDERS_MESSAGE =
    "This business isn't taking orders right now.";

/** What a customer reads booking on a paused website. */
export const NOT_TAKING_BOOKINGS_MESSAGE =
    "This business isn't taking bookings online right now.";

/** 409 to a customer: a paused location or website takes no orders. */
export function notTakingOrders(
    what: "orders" | "bookings" = "orders",
): ConflictException {
    return new ConflictException({
        message:
            what === "bookings"
                ? NOT_TAKING_BOOKINGS_MESSAGE
                : NOT_TAKING_ORDERS_MESSAGE,
        details: { code: NOT_TAKING_ORDERS, reason: "notTakingOrders" },
    });
}

/** What a paused team member reads trying to open the business. */
export function memberPausedWords(businessName: string): string {
    return `Your access to ${businessName} is paused. Its plan includes fewer team members than it has, so the people who joined most recently are paused until it moves up again. Nothing of yours is lost. Ask the owner to choose a plan in Plan and billing.`;
}

export const INVITATION_PAUSED = "INVITATION_PAUSED";

/** What someone reads accepting an invitation past the plan's limit. */
export function invitationPausedWords(businessName: string): string {
    return `${businessName}'s plan has no room for you right now, so this invitation can't be accepted yet. You can accept it once the business moves up, while the invitation is still valid. Ask the owner to choose a plan in Plan and billing.`;
}

/** 409: accepting an invitation the plan has paused. */
export function invitationPaused(businessName: string): ConflictException {
    return new ConflictException({
        message: invitationPausedWords(businessName),
        details: { code: INVITATION_PAUSED },
    });
}

/** 403: a paused team member opening the business. */
export function memberPaused(businessName: string): ForbiddenException {
    return new ForbiddenException({
        message: memberPausedWords(businessName),
        details: { code: MEMBER_PAUSED },
    });
}

/**
 * Whether an error is the `MEMBER_PAUSED` refusal, so a guard that would
 * otherwise swallow it (and answer with a generic denial, or let the
 * request through) passes it on in its own words.
 */
export function isMemberPaused(err: unknown): boolean {
    if (!(err instanceof ForbiddenException)) return false;
    const body = err.getResponse();
    if (typeof body !== "object") return false;
    const details = (body as { details?: unknown }).details;
    return (
        typeof details === "object" &&
        details !== null &&
        (details as { code?: unknown }).code === MEMBER_PAUSED
    );
}

function joinNames(names: readonly string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What the business reads booking someone on the diary with no login who
 * is past the team limit (#800): they take no new bookings, and the
 * bookings already made with them are kept.
 */
export function diaryPausedWords(names: readonly string[]): string {
    const who = names.length > 0 ? joinNames(names) : "This person";
    const are = names.length > 1 ? "are" : "is";
    return `${who} ${are} paused. Your plan includes fewer team members than you have, so the people who joined most recently take no new bookings. Bookings already made are kept. Choose a plan in Plan and billing to bring them back.`;
}

/** 409 to the team: a booking with a diary person the plan has paused. */
export function diaryPaused(names: readonly string[]): ConflictException {
    return new ConflictException({
        message: diaryPausedWords(names),
        details: { code: PAUSED_BY_PLAN, kind: "person", field: "staffId" },
    });
}

/** What a customer reads naming someone who takes no bookings just now. */
export const PERSON_NOT_TAKING_BOOKINGS =
    "That person isn't taking bookings right now. Pick someone else.";

/** What a customer reads when nobody who takes a service is taking bookings. */
export const SERVICE_NOT_TAKING_BOOKINGS =
    "This service isn't taking bookings right now.";
