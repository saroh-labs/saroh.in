import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import {
    applyMandateChangeInTx,
    linkMandateSetupInTx,
} from "../payments/mandate-events";
import type {
    WebhookMandateLink,
    WebhookProvider,
} from "./providers/webhook-provider.port";

type Tx = Prisma.TransactionClient;

const logger = new Logger("MandateLink");

/** How many of a business's earlier deliveries a link looks back through. */
const CATCH_UP_LIMIT = 100;

/**
 * An authorisation's payment named its mandate (round-2 D19): link the
 * token to its PENDING set-up, then apply any token event that came
 * first. Razorpay's `token.confirmed` names no customer, order or link,
 * so when it beats the payment it finds no mandate and is acknowledged
 * with nothing written; once the token is linked, those stored
 * deliveries — as verified when they arrived — are read again and
 * applied, in the order they came. Returns whether anything moved.
 */
export async function linkMandateInTx(
    tx: Tx,
    webhookProvider: WebhookProvider,
    organizationId: string,
    link: WebhookMandateLink,
): Promise<boolean> {
    const provider = webhookProvider.name;
    const linked = await linkMandateSetupInTx(
        tx,
        organizationId,
        provider,
        link,
    );
    if (!linked) return false;

    const earlier = await tx.webhookEvent.findMany({
        where: {
            organizationId,
            provider,
            status: { in: ["IGNORED", "RECEIVED"] },
            createdAt: { gte: linked.createdAt },
        },
        orderBy: { createdAt: "asc" },
        take: CATCH_UP_LIMIT,
        select: { id: true, payload: true },
    });
    for (const row of earlier) {
        let change;
        try {
            const event = webhookProvider.parseEvent({
                payload: row.payload,
                headers: {},
            });
            change = event.outcome === "MANDATE" ? event.mandate : undefined;
        } catch {
            continue;
        }
        if (change?.providerMandateId !== link.providerMandateId) continue;
        const { applied } = await applyMandateChangeInTx(
            tx,
            organizationId,
            provider,
            change,
        );
        if (applied) {
            await tx.webhookEvent.updateMany({
                where: { id: row.id, status: "IGNORED" },
                data: { status: "PROCESSED", processedAt: new Date() },
            });
            logger.log(
                `Mandate ${linked.mandateId}: applied an earlier ${change.status} once its payment named it`,
            );
        }
    }
    return true;
}
