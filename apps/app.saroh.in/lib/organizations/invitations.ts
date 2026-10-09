import { z } from "zod";

import { shortDate } from "@/lib/sites/format-date";

/**
 * What the Team screen says about an invitation, and what it refuses to send
 * ("Saroh Settings" design, Team → People).
 *
 * Pure, so the words can be pinned without a browser: the invite dialog's
 * inline error and each pending row's meta line.
 */

/** A week — the API's `INVITE_TTL_MS`. Sending again restarts it. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A shape check, not a delivery check: the API validates it again. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Why an invite to this address would not be sent, or `null` when it would.
 *
 * Someone already invited is refused here rather than silently re-sent — the
 * API would refresh their invitation in place, but the list has a Resend for
 * that, and a second "Invite sent" for the same person reads as a duplicate.
 */
export function inviteEmailError(
    raw: string,
    known: { memberEmails: string[]; invitedEmails: string[] },
): string | null {
    const email = raw.trim().toLowerCase();
    if (!email) return "Add their email address.";
    if (!EMAIL.test(email)) return "That doesn't look like an email address.";
    if (known.memberEmails.some((e) => e.toLowerCase() === email)) {
        return "They're already on the team.";
    }
    if (known.invitedEmails.some((e) => e.toLowerCase() === email)) {
        return "They're already invited — resend it from the list.";
    }
    return null;
}

/**
 * A pending row's second line: when it was sent, whether it was sent again,
 * and until when the link works — or that it no longer does.
 *
 * Sending again keeps `createdAt` and moves `expiresAt` a week on from that
 * moment, so an expiry more than a week after creation means it was re-sent,
 * and when.
 */
export function invitationMeta(
    invitation: { createdAt: string | Date; expiresAt: string | Date },
    /** The business's zone (UX-008): the day it says is the business's. */
    zone: string,
    now: Date = new Date(),
): string {
    const created = new Date(invitation.createdAt);
    const expires = new Date(invitation.expiresAt);
    const day = (d: Date) =>
        shortDate(d, zone) === shortDate(now, zone)
            ? "today"
            : shortDate(d, zone);

    const parts = [`Invited ${day(created)}`];
    const lastSent = new Date(expires.getTime() - INVITE_TTL_MS);
    // A minute's slack: the first send's expiry is computed a moment after
    // the row's `createdAt`.
    if (lastSent.getTime() - created.getTime() > 60_000) {
        parts.push(`sent again ${day(lastSent)}`);
    }
    parts.push(
        expires.getTime() <= now.getTime()
            ? `link expired ${day(expires)} — resend for a fresh one`
            : `link works until ${shortDate(expires, zone)}`,
    );
    return parts.join(" · ");
}

/**
 * The invite dialog's form. The address is checked against who is already
 * here, which is why it is built from the roster rather than fixed.
 */
export function inviteSchema(known: {
    memberEmails: string[];
    invitedEmails: string[];
}) {
    return z
        .object({
            email: z.string(),
            /** Any role this business has, built-in or invented. */
            role: z.string().min(1),
            siteIds: z.array(z.string()),
            /** Who on the diary this gives a login to (#868); "" for no one. */
            staffId: z.string().optional(),
        })
        .superRefine((values, ctx) => {
            const problem = inviteEmailError(values.email, known);
            if (problem) {
                ctx.addIssue({
                    code: "custom",
                    path: ["email"],
                    message: problem,
                });
            }
            // A reviewer reaches only the sites named here; with none they
            // would reach nothing, and the API refuses that invite.
            if (values.role === "REVIEWER" && values.siteIds.length === 0) {
                ctx.addIssue({
                    code: "custom",
                    path: ["siteIds"],
                    message: "Pick the websites they may review.",
                });
            }
        });
}

export type InviteValues = z.infer<ReturnType<typeof inviteSchema>>;

/**
 * What the plan's team cap counts, said plainly (UX-028, DEC-105): "2 people
 * including you · 1 invite waiting · 1 view-only person". The seats count
 * everyone who can change something, the owner included, everyone on the
 * diary with no login (`noLogin`), and every such invite not yet answered;
 * people who only look use no seat, and are said apart (`billing/seats.ts`
 * on the API).
 */
export function teamCountLine(
    people: number,
    waiting: number,
    viewOnly = 0,
    noLogin = 0,
): string {
    const parts = [
        people === 1 ? "Just you" : `${people} people including you`,
    ];
    // Bookable staff with no login use a seat too (DEC-105, UX-053).
    if (noLogin > 0) {
        parts.push(
            `${noLogin === 1 ? "1 person" : `${noLogin} people`} taking bookings with no login`,
        );
    }
    if (waiting > 0) {
        parts.push(
            `${waiting === 1 ? "1 invite" : `${waiting} invites`} waiting`,
        );
    }
    if (viewOnly > 0) {
        parts.push(
            `${viewOnly === 1 ? "1 view-only person" : `${viewOnly} view-only people`}, no seat`,
        );
    }
    return parts.join(" · ");
}

/** Whether a role, a person or an invite uses a team seat (DEC-105). */
export function usesSeat(x: { usesSeat?: boolean } | undefined): boolean {
    // Unknown (an older API): counted, the way the API meters what it can't
    // tell apart.
    return x?.usesSeat !== false;
}

/**
 * The Team line's three counts: seats taken, seat invites waiting, and
 * view-only people with their invites. An invite for someone on the diary
 * with no login is that person, already counted among those taking
 * bookings with no login (#868), so it isn't counted again.
 */
export function teamCounts(
    members: readonly { usesSeat?: boolean }[],
    invitations: readonly { usesSeat?: boolean; countedOnDiary?: boolean }[],
): { people: number; waiting: number; viewOnly: number } {
    const seated = (xs: readonly { usesSeat?: boolean }[]) =>
        xs.filter((x) => usesSeat(x)).length;
    const open = invitations.filter((i) => i.countedOnDiary !== true);
    return {
        people: seated(members),
        waiting: seated(open),
        viewOnly: members.length + open.length - seated(members) - seated(open),
    };
}

/** The plan's caps on Team, as the page reads them (U14, DEC-105). */
export interface TeamLimit {
    /** The team seats, open invites counted, have reached their cap. */
    full: boolean;
    /** The notice's reason, in the design's words. */
    why: string;
    /** The view-only people cap is reached too (their own, DEC-105). */
    reviewersFull?: boolean;
    /** Its reason, in the same words. */
    reviewersWhy?: string;
}

/**
 * Who Invite can still ask (UX-028, DEC-105). Full seats stop roles that
 * can change something, not view-only ones, which have a cap of their
 * own, and the other way round: the dialog stays open with the roles that
 * don't fit disabled and the reason beside them. Only when both caps are
 * reached is there no one to invite.
 */
export function inviteRoom(limit: TeamLimit | null | undefined): {
    /** Anyone at all can be invited. */
    open: boolean;
    /** Why a role that takes a seat can't be picked; null when it can. */
    seatReason: string | null;
    /** Why a view-only role can't be picked; null when it can. */
    viewOnlyReason: string | null;
} {
    if (!limit) return { open: true, seatReason: null, viewOnlyReason: null };
    return {
        open: !(limit.full && limit.reviewersFull === true),
        seatReason: limit.full
            ? `${limit.why} (invites count too). View-only people don't take a seat.`
            : null,
        viewOnlyReason: limit.reviewersFull
            ? `${limit.reviewersWhy ?? "You've reached your plan's view-only people"} (invites count too).`
            : null,
    };
}

/**
 * The people on the diary who take bookings with no login: each uses a team
 * seat (DEC-105, UX-053). One who is a team member is counted on Team
 * already, so is left out.
 */
export function bookableWithNoLogin(
    staff: readonly { status: string; membership: unknown }[] | null,
): number {
    return (staff ?? []).filter((s) => s.status === "ACTIVE" && !s.membership)
        .length;
}
