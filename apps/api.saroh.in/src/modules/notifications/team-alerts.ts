import type { Prisma } from "@saroh/database";

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
 */
export type TeamAlertPayload =
    | { event: "order"; orderId: string; actorUserId?: string | null }
    | { event: "failed"; invoiceId: string; paymentIntentId: string }
    | { event: "team"; userId: string; invitationId: string }
    | { event: "booking"; notificationId: string }
    | {
          event: "site";
          testReleaseId: string;
          goLiveAt: string;
          outcome: "LIVE" | "NOT_LIVE";
          reason?: string;
          schedulerUserId: string;
      };

type Tx = Pick<Prisma.TransactionClient, "job">;

/** Queue one alert on the caller's transaction. */
export async function enqueueTeamAlert(
    tx: Tx,
    organizationId: string,
    payload: TeamAlertPayload,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId,
            type: TEAM_ALERT_TYPE,
            payload,
        },
    });
}
