import type { Prisma } from "@saroh/database";

import { emailRoute } from "../communications/email-route";
import { noticeOn } from "../communications/notice-settings";
import { enqueueHeldCustomerNotice } from "./customer-notify-queue";
import { contactNotice } from "./notice-reach";
import { TEAM_REPLY_HOLD_MS, teamReplyNoticeKey } from "./notices/thread-reply";

/**
 * A team reply in a customer's Messages, emailed to them (DEC-174 U14,
 * #1145): queued on the reply's own transaction, held
 * {@link TEAM_REPLY_HOLD_MS} so replies a few seconds apart go as one
 * email (`notices/thread-reply.ts`).
 *
 * Queued only while both hold, read on this transaction:
 * - the business's own email provider is connected (DEC-086 reversed:
 *   Saroh never sends it; with none, the reply waits in Messages as
 *   today);
 * - its TEAM_REPLY switch is on.
 *
 * The job reads the switch, the provider, the address and consent again
 * when it runs. Messages has no Undo on a reply, so nothing takes it back.
 * Returns whether one was queued.
 */
export async function enqueueTeamReplyNotice(
    tx: Pick<
        Prisma.TransactionClient,
        "job" | "communicationProvider" | "customerNoticeSetting"
    >,
    input: { organizationId: string; threadMessageId: string; now: Date },
): Promise<boolean> {
    if ((await emailRoute(tx, input.organizationId)) === null) return false;
    if (!(await noticeOn(tx, input.organizationId, "TEAM_REPLY"))) {
        return false;
    }
    await enqueueHeldCustomerNotice(
        tx,
        input.organizationId,
        {
            kind: "THREAD_REPLY",
            eventKey: teamReplyNoticeKey(input.threadMessageId),
            threadMessageId: input.threadMessageId,
        },
        { now: input.now, ms: TEAM_REPLY_HOLD_MS },
    );
    return true;
}

/**
 * Where a team reply to this contact is emailed now, for the line under
 * Messages' reply box ("Emailed to ‹email›"); null when it isn't: no
 * provider, the switch off, no address, or email turned off by them. The
 * same reads the job makes (`contactNotice`), so the line never claims an
 * email that won't go.
 */
export async function teamReplyEmailedTo(
    db: Pick<
        Prisma.TransactionClient,
        | "communicationProvider"
        | "customerNoticeSetting"
        | "customerAccount"
        | "contact"
        | "consent"
        | "$queryRaw"
    >,
    organizationId: string,
    contactId: string,
): Promise<string | null> {
    const [provider, on] = await Promise.all([
        emailRoute(db, organizationId),
        noticeOn(db, organizationId, "TEAM_REPLY"),
    ]);
    if (provider === null || !on) return null;
    const { to } = await contactNotice(db, organizationId, contactId, {
        email: true,
        thread: false,
    });
    return to;
}
