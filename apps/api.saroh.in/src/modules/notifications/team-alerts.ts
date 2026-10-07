import type { Prisma } from "@saroh/database";
import type { AlertEvent } from "./alert-preferences";

/**
 * The team's alerts (round-2 F14): what a producer writes, inside its own
 * transaction, so a committed order, a failed payment or an accepted
 * invitation always has its alert (the transactional outbox). The
 * `team.alert` job (`team-alert.handler.ts`) re-reads what it is about,
 * puts it in the business's inbox (the bell) and emails the people who
 * chose email for it.
 *
 * Plain functions over the caller's transaction: no module has to import
 * the notifications module to raise one.
 */

/** The job type. */
export const TEAM_ALERT_TYPE = "team.alert";

/**
 * What an alert is about: ids only; the handler reads the rest when it
 * runs.
 * - `order`: an order placed — paid online, or taken by the team.
 *   `actorUserId` is who took it, who isn't emailed about their own order.
 * - `failed`: a payment on an invoice's pay link that didn't go through.
 * - `team`: someone accepted an invitation and joined the team. Keyed to
 *   the invitation, so someone who leaves and is invited back is told of
 *   again.
 * - `booking`: a booking the customer made, moved or cancelled themselves.
 *   `booking.notify` has already put it in the inbox (A14), so this names
 *   that notice, and only the email is left to do.
 * - `site`: a test release's scheduled go-live ran (DEC-071, T10): it went
 *   live, or it didn't, and `reason` says why in the merchant's words (the
 *   run's own finding, not data read back). Keyed to the release and the
 *   instant it was scheduled for, so each schedule is told of once. The
 *   person who scheduled it is always emailed, whatever they chose.
 * - `uncollected`: a website order to pay on collection or delivery still
 *   unpaid and not handed over three days after it was placed (R34,
 *   `orders/uncollected.ts`). Queued with the order, for the instant it
 *   becomes due; told on the New order row's choices, once per order.
 * - `provider`: a connected payment or email provider refused the
 *   business's keys on a live call and was marked as needing attention
 *   (UX-012). Keyed to the connection and the instant it was flagged, so
 *   each refusal is told once; told on the Payment failed row. An email
 *   provider's goes to the bell only: its own email would go through the
 *   keys that were just refused.
 * - `review`: the website's review (UX-043). A review asked for, or a new
 *   test release, tells the site's reviewers by Saroh's own mail (they
 *   have no bell); a verdict, or a reviewer's first note of a round, tells
 *   the people who publish, on the Website row. Keyed to the approval, the
 *   release, or the reviewer's round.
 */
export type TeamAlertPayload =
    | { event: "order"; orderId: string; actorUserId?: string | null }
    | { event: "failed"; invoiceId: string; paymentIntentId: string }
    | { event: "team"; userId: string; invitationId: string }
    | { event: "booking"; notificationId: string }
    | { event: "uncollected"; orderId: string }
    | {
          event: "provider";
          channel: "PAYMENTS" | "EMAIL";
          providerId: string;
          since: string;
      }
    | { event: "review"; about: "approval"; approvalId: string }
    | { event: "review"; about: "note"; commentId: string }
    | { event: "review"; about: "release"; testReleaseId: string }
    | {
          event: "site";
          testReleaseId: string;
          goLiveAt: string;
          outcome: "LIVE" | "NOT_LIVE";
          reason?: string;
          schedulerUserId: string;
      };

type Tx = Pick<Prisma.TransactionClient, "job">;

/**
 * Queue one alert on the caller's transaction: now, or at `runAt` for one
 * that is due later (an uncollected order's).
 */
export async function enqueueTeamAlert(
    tx: Tx,
    organizationId: string,
    payload: TeamAlertPayload,
    runAt?: Date,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId,
            type: TEAM_ALERT_TYPE,
            payload,
            ...(runAt ? { runAt } : {}),
        },
    });
}

/**
 * An alert, worded. Here rather than in the handler so a wording module
 * (`uncollected-alert.ts`) can use it without importing the handler back.
 */
export interface WordedAlert {
    event: AlertEvent;
    /** Unique per business: claimed once, so the alert goes out once. */
    eventKey: string;
    /** The inbox notice already written (a booking's), or null to write one. */
    notificationId: string | null;
    type: string;
    title: string;
    body: string;
    /** Where it opens in the workspace, for the email. */
    path: string | null;
    /** Not emailed about their own doing. */
    skipUserId: string | null;
    /**
     * Emailed whatever they chose, while still on the team: whoever
     * scheduled a go-live hears how it went (DEC-071, T10).
     */
    alwaysUserId?: string | null;
    /** The bell only, never an email (an email provider's own alert). */
    bellOnly?: boolean;
    /** No inbox notice: it is for people with no bell (a site's reviewers). */
    noBell?: boolean;
    /**
     * Saroh's own mail tells them instead of the business's provider, as an
     * enquiry's notice does (`team-mail.ts`):
     * - `OWNERS_ADMINS`: a new website order (UX-042), unless they turned
     *   this row's email off;
     * - `REVIEWERS`: the reviewers of `siteId` (UX-043).
     */
    sarohMail?: "OWNERS_ADMINS" | "REVIEWERS";
    siteId?: string;
    /** The email's button. */
    cta?: string;
    orderId?: string;
}

/** One email Saroh's own mail sends to someone on the team, after commit. */
export interface TeamMail {
    to: string;
    subject: string;
    heading: string;
    text: string;
    url: string;
    cta: string;
}
