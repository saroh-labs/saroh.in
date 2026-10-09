import type { Prisma } from "@saroh/database";
import type { AlertEvent } from "./alert-preferences";

/**
 * The team's alerts (round-2 F14): what a producer writes, inside its own
 * transaction, so a committed order, a failed payment or an accepted
 * invitation always has its alert (the transactional outbox). The
 * `team.alert` job (`team-alert.handler.ts`) re-reads what it is about,
 * puts it in the business's inbox (the bell) and emails, from Saroh, the
 * people who chose email for it.
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
 *   each refusal is told once; told on the Payment failed row. Saroh
 *   sends the email, so an email provider's refusal is emailed too.
 * - `review`: the website's review (UX-043). A review asked for, or a new
 *   test release, emails the site's reviewers (they have no bell); a verdict, or a reviewer's first note of a round, tells
 *   the people who publish, on the Website row. Keyed to the approval, the
 *   release, or the reviewer's round.
 * - `domain`: a live custom domain stopped reaching its site, or came back
 *   (#917, `domain-alerts.ts`), queued by the domain's check. `at` is the
 *   check that saw it; told once per incident, on the Your website row.
 *   `actorUserId` pressed "Check now" and isn't emailed.
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
          event: "domain";
          domainId: string;
          change: "down" | "back";
          at: string;
          actorUserId?: string | null;
      }
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
    /**
     * What the email says (DEC-011, amended 2026-10-07): Saroh sends it in
     * its own name, so fixed words and the business's own names, cleaned
     * (`cleanName`), and never what a customer typed: no customer's name,
     * no free text from a run. The bell keeps the full words above.
     */
    mail: { heading: string; body: string };
    /** Where it opens in the workspace, for the email. */
    path: string | null;
    /** Not emailed about their own doing. */
    skipUserId: string | null;
    /**
     * Emailed whatever they chose, while still on the team: whoever
     * scheduled a go-live hears how it went (DEC-071, T10).
     */
    alwaysUserId?: string | null;
    /** No inbox notice: it is for people with no bell (a site's reviewers). */
    noBell?: boolean;
    /**
     * A new website order (UX-042): the owners and admins are emailed
     * unless they turned this row's email off, as of an enquiry, whatever
     * the row's default.
     */
    ownersAdminsByDefault?: boolean;
    /**
     * Email this site's reviewers instead of the row's choices (UX-043): a
     * review asked of them, or a new test release.
     */
    emailReviewersOf?: string;
    /** The email's button; "Open it in Saroh" when not said. */
    cta?: string;
    orderId?: string;
}
