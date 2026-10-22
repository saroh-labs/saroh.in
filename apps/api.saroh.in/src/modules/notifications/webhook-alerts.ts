import type { Prisma } from "@saroh/database";

import { noticeOf } from "./notice-target";
import { PROVIDER_NAMES } from "./provider-alerts";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * A payment provider's event Saroh couldn't apply after all its tries
 * (`webhooks/webhooks.service.ts`): a payment, refund or autopay change the
 * provider made that Saroh's records don't show yet. Saroh's operators are
 * raised it in Needs action and replay it; the team is told too, so nobody
 * acts on a record that is out of step. Queued on the transaction that
 * marks the delivery FAILED, once per delivery; told only while it is
 * still FAILED (a replay that lands first says nothing). On the Payment
 * failed row, from Saroh. Fixed words: the provider's name is ours.
 */
export const WEBHOOK_UNAPPLIED_NOTIFICATION_TYPE = "payment.event_unapplied";

type WebhookAlert = Extract<TeamAlertPayload, { event: "webhook" }>;

/** What a provider's event was about, in the team's words. */
function aboutWords(eventType: string): string {
    if (/refund/i.test(eventType)) return "refund";
    if (/mandate|token|subscription/i.test(eventType)) return "autopay";
    return "payment";
}

export async function wordWebhook(
    tx: Pick<Prisma.TransactionClient, "webhookEvent">,
    organizationId: string,
    p: WebhookAlert,
): Promise<WordedAlert | null> {
    const row = await tx.webhookEvent.findFirst({
        where: { id: p.webhookEventId, organizationId },
        select: { id: true, provider: true, eventType: true, status: true },
    });
    if (row?.status !== "FAILED") return null;
    const name = PROVIDER_NAMES[row.provider] ?? row.provider;
    const about = aboutWords(row.eventType);
    const heading = `A ${about} update from ${name} isn't in Saroh yet`;
    const body = `${name} told Saroh about a ${about}, and Saroh couldn't record it. Saroh's team has been told and is putting it right. Until then, check it in your ${name} dashboard before you act on it.`;
    return {
        event: "failed",
        eventKey: `team:webhook:${row.id}`,
        notificationId: null,
        // A page, not a record: the event may name none Saroh has.
        ...noticeOf(WEBHOOK_UNAPPLIED_NOTIFICATION_TYPE, {}),
        path: "/settings/providers",
        cta: "Open Providers",
        skipUserId: null,
        title: heading,
        body,
        mail: { heading, body },
    };
}
