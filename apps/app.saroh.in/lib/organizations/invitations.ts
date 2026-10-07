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
    now: Date = new Date(),
): string {
    const created = new Date(invitation.createdAt);
    const expires = new Date(invitation.expiresAt);
    const day = (d: Date) =>
        shortDate(d) === shortDate(now) ? "today" : shortDate(d);

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
            : `link works until ${shortDate(expires)}`,
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
 * What the plan's team cap counts, said plainly (UX-028): "2 people
 * including you · 1 invite waiting". The cap counts everyone in the
 * business, the owner included, and every invite not yet answered —
 * Reviewers never (`billing/metering.ts`). Without this the screen read
 * "Team is full" beside People = 1.
 */
export function teamCountLine(people: number, waiting: number): string {
    const who = people === 1 ? "Just you" : `${people} people including you`;
    if (waiting === 0) return who;
    return `${who} · ${waiting === 1 ? "1 invite" : `${waiting} invites`} waiting`;
}

/** The plan's caps on Team, as the page reads them (U14). */
export interface TeamLimit {
    /** The team, open invites counted, has reached its cap. */
    full: boolean;
    /** The notice's reason, in the design's words. */
    why: string;
    /** The Reviewers cap is reached too (Reviewers have their own, U13). */
    reviewersFull?: boolean;
}

/**
 * Who Invite can still ask (UX-028). A full team stops seats, not
 * Reviewers, who have a cap of their own: the dialog stays open with
 * every other role disabled and the reason beside it. Only when both caps
 * are reached is there no one to invite.
 */
export function inviteRoom(limit: TeamLimit | null | undefined): {
    /** Anyone at all can be invited. */
    open: boolean;
    /** Why a role that takes a seat can't be picked; null when it can. */
    seatReason: string | null;
} {
    if (!limit?.full) return { open: true, seatReason: null };
    return {
        open: !limit.reviewersFull,
        seatReason: `${limit.why} (invites count too). A Reviewer doesn't take a seat.`,
    };
}
