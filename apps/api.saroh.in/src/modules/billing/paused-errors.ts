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
