import type { Prisma } from "@saroh/database";
import type { AlertEvent } from "./alert-preferences";
import type { NoticeColumns } from "./notice-target";

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
 *   (UX-012), `change` "down" (or absent, as queued before #555); or it
 *   works again — keys entered again, or a live call accepted — "back"
 *   (#555). Keyed to the connection, the change and the instant, and told
 *   once per incident (`provider-alerts.ts`); on the Payment failed row.
 *   Saroh sends the email, so an email provider's refusal is emailed too.
 *   `actorUserId` is who entered the keys again, not emailed.
 * - `review`: the website's review (UX-043). A review asked for, or a new
 *   test release, emails the site's reviewers (they have no bell); a verdict, or a reviewer's first note of a round, tells
 *   the people who publish, on the Website row. Keyed to the approval, the
 *   release, or the reviewer's round.
 * - `domain`: a live custom domain stopped reaching its site, or came back
 *   (#917, `domain-alerts.ts`), queued by the domain's check. `at` is the
 *   check that saw it; told once per incident, on the Your website row.
 *   `actorUserId` pressed "Check now" and isn't emailed.
 * - `ask`: a permission request to the people who may answer it, and the
 *   answer back to whoever asked (DEC-170, `ask-alerts.ts`). `about` names
 *   what was asked; today only a Member's own booking rules (#1038).
 *   `step` "asked" emails everyone who may approve it; "answered" emails
 *   the person who asked, with the reason when turned down. The bell's
 *   notice is written on the request's own transaction and named here
 *   (`notificationId`), so only the email is left to do. Keyed to the
 *   request and the step.
 * - `request`: a customer asked the business to remove their data from
 *   their site account (DEC-172, `data-request-alerts.ts`). Keyed to the
 *   request; told to whoever can run a customer removal, on its own row.
 * - `booking-mine`: a booking with someone on the diary who has a login was
 *   made, moved or cancelled (DEC-174, #1138), told to that one person
 *   (`userId`) in their own alerts and by email, on "Bookings with you".
 *   Queued by `booking.notify` for the person the event is about, never
 *   the one who did it. `change` "moved-away" and a "new" from a
 *   reassignment (#1157) are email only: the reassigning write put the
 *   bell's notice in their alerts already. Keyed to the event and person.
 */
export type TeamAlertPayload =
    | { event: "order"; orderId: string; actorUserId?: string | null }
    | { event: "failed"; invoiceId: string; paymentIntentId: string }
    | { event: "team"; userId: string; invitationId: string }
    | { event: "booking"; notificationId: string }
    | { event: "uncollected"; orderId: string }
    | { event: "request"; requestId: string }
    | {
          event: "booking-mine";
          bookingId: string;
          eventId: string;
          userId: string;
          change: "new" | "moved" | "moved-away" | "cancelled";
      }
    | {
          event: "provider";
          channel: "PAYMENTS" | "EMAIL";
          providerId: string;
          /** When it was flagged ("down") or cleared ("back"). */
          since: string;
          change?: "down" | "back";
          actorUserId?: string | null;
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
          event: "ask";
          about: "rules";
          requestId: string;
          step: "asked" | "answered";
          notificationId: string;
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
export interface WordedAlert extends NoticeColumns {
    /**
     * The alert's row in Settings › Your profile, or "ask": a permission
     * request or its answer, which has no row and no switch (DEC-170).
     */
    event: AlertEvent | "ask";
    /** Unique per business: claimed once, so the alert goes out once. */
    eventKey: string;
    /** The inbox notice already written (a booking's), or null to write one. */
    notificationId: string | null;
    /**
     * The notice's type, with what it opens beside it (`orderId`,
     * `invoiceId`, `siteId`…): build both with `noticeOf`, which makes the
     * target required for the type (`notice-target.ts`). An alert with no
     * bell (`noBell`) writes no notice and names its type plainly.
     */
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
    /**
     * Email exactly these people, still on the team, whatever they chose
     * (DEC-170): a request goes to everyone who may answer it, its answer
     * to whoever asked. Set, it stands in for the row's choices.
     */
    emailUserIds?: readonly string[];
    /** Why they got it, when it isn't a row's choice (`emailUserIds`). */
    footer?: string;
    /**
     * A personal alert (#1138, "Bookings with you"): the bell's notice is
     * this person's alone (`Notification.userId`), and only they are
     * emailed, on the row's choices.
     */
    forUserId?: string;
}
