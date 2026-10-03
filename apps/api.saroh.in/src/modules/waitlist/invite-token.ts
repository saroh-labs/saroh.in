import { createHash, randomBytes } from "node:crypto";

import type { Catalog } from "@saroh/pricing-catalog";

/**
 * The opening-day invite's link and the launch offer it carries (marketing
 * plan U31, KTD-17, OQ-1). Pure, so the rules are tested on their own.
 */

/** How long an invite link works. A technical limit, not an offer term. */
export const INVITE_VALID_DAYS = 30;

/**
 * A claim older than this whose email never left (a process stopped
 * mid-send) may be sent again by a later batch. Long enough that a send
 * still in flight is never doubled.
 */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/** The catalogue plan the launch offer puts a business on (OQ-1). */
export const LAUNCH_OFFER_PLAN = "grow";

/** 32 random bytes, base64url: 43 characters. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A new invite token. Only its hash is ever stored. */
export function newInviteToken(): string {
    return randomBytes(32).toString("base64url");
}

/** What the table keeps of a token: its SHA-256, hex. */
export function hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** When a link minted at `now` stops working. */
export function inviteExpiry(now: Date): Date {
    return new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS);
}

export interface LaunchOffer {
    planKey: string;
    days: number;
}

/**
 * The launch offer this instance gives, or null when it gives none: its
 * length is the owner's number, read from `LAUNCH_OFFER_DAYS`, never
 * written in the code.
 */
export function launchOffer(days: number | undefined): LaunchOffer | null {
    if (days === undefined || !Number.isInteger(days) || days < 1) return null;
    return { planKey: LAUNCH_OFFER_PLAN, days };
}

/**
 * The launch offer as saroh.in's waitlist page shows it (`GET
 * /public/waitlist/offer`): the plan's id and its name in the live
 * catalogue, and the offer's length. Null when the instance gives no offer,
 * or the live catalogue (`catalog`, null before one is installed) has no
 * such plan, so the page never names a plan that isn't there.
 */
export interface PublicLaunchOffer {
    planId: string;
    planName: string;
    days: number;
}

export function publicLaunchOffer(
    offer: LaunchOffer | null,
    catalog: Pick<Catalog, "plans"> | null,
): PublicLaunchOffer | null {
    if (!offer || !catalog) return null;
    const plan = catalog.plans.find((p) => p.id === offer.planKey);
    if (!plan) return null;
    return { planId: plan.id, planName: plan.name, days: offer.days };
}

/** When an offer taken at `now` ends. */
export function offerEnds(offer: LaunchOffer, now: Date): Date {
    return new Date(now.getTime() + offer.days * DAY_MS);
}

/**
 * The link in the email: accounts' sign-up, carrying the token (which rides
 * on to onboarding) and the address it was sent to, to fill in the form.
 */
export function inviteUrl(
    signupBase: string,
    token: string,
    email: string,
): string {
    const q = new URLSearchParams({ invite: token, email });
    return `${signupBase}?${q.toString()}`;
}
