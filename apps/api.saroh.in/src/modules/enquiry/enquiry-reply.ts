import type { Prisma } from "@saroh/database";

import { emailRoute } from "../communications/email-route";
import { noticeOn } from "../communications/notice-settings";
import type { FormField } from "../forms/dto";
import {
    enqueueCustomerNotice,
    enquiryReceivedNoticeKey,
} from "../site-accounts/customer-notify-queue";
import { looksLikeSpam } from "./enquiry-words";

/**
 * Queue the enquiry's auto-reply, "we got your message" (DEC-174 U15,
 * #1146), on the submit's own transaction: a `customer.notify` job of its
 * own, beside (never inside) the team's `enquiry.notify`, keyed to the
 * submission so it is sent once.
 *
 * Queued only when all hold, so the team's notice is never touched:
 * - the submission isn't obvious spam (`looksLikeSpam`);
 * - the business's own email provider is connected (DEC-086 reversed:
 *   Saroh never sends it);
 * - its ENQUIRY_REPLY switch is on, read on this transaction.
 *
 * The job checks the switch and the provider again when it runs, and
 * sends at most one a day to an address (`notices/enquiry-received.ts`).
 * A merchant automation on `lead.created` that emails too doesn't stop it;
 * the switch's words say so.
 *
 * Returns whether one was queued.
 */
export async function enqueueEnquiryReply(
    tx: Pick<
        Prisma.TransactionClient,
        "job" | "communicationProvider" | "customerNoticeSetting"
    >,
    input: {
        organizationId: string;
        submissionId: string;
        fields: readonly FormField[];
        data: Record<string, unknown>;
    },
): Promise<boolean> {
    if (looksLikeSpam(input.fields, input.data)) return false;
    if ((await emailRoute(tx, input.organizationId)) === null) return false;
    if (!(await noticeOn(tx, input.organizationId, "ENQUIRY_REPLY"))) {
        return false;
    }
    await enqueueCustomerNotice(tx, input.organizationId, {
        kind: "ENQUIRY_RECEIVED",
        eventKey: enquiryReceivedNoticeKey(input.submissionId),
        submissionId: input.submissionId,
    });
    return true;
}
