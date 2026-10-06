import type { Message } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    SarohBusinessEmail,
    SarohSendOutcome,
} from "./providers/saroh-email.sender";
import { sendSarohBusinessEmail } from "./providers/saroh-email.sender";
import { SAROH_STOPPED, SAROH_UNKNOWN } from "./saroh-delivery";
import { sarohSwitchesOn } from "./saroh-may-send";
import { SECRET_LINK_SLOT } from "./transactional";

/**
 * `message.send` for a delivery stamped `SAROH` (DEC-086): the business had
 * no email of its own when it was queued, so Saroh's sender hands it to SES.
 * The stamp is honoured — a provider connected since doesn't send it a
 * second way — but the switches are asked again, so the global stop or the
 * business's flag turned off stops it even after it was queued.
 *
 * - A switch off: the delivery is STOPPED (terminal, never retried, never
 *   counted) and the message FAILED.
 * - The flag couldn't be read: this throws before anything is recorded, so
 *   the delivery stays QUEUED and the worker retries it with backoff.
 * - Sent: the delivery and the message SENT.
 * - `unknown` (the connection dropped after SES started taking it): it may
 *   have gone, so it is never retried; the delivery and the message are
 *   UNKNOWN, and it counts.
 * - Failed, or no mail set up: FAILED, and this throws so the worker
 *   retries it, as any send.
 *
 * Returns whether it was sent. Only the outcome is recorded: never the
 * address, the credentials or SES's reply.
 */
export async function deliverThroughSaroh(
    deliveryId: string,
    message: Pick<
        Message,
        "id" | "organizationId" | "toAddress" | "subject" | "body"
    >,
    send: (email: SarohBusinessEmail) => Promise<SarohSendOutcome> = (email) =>
        sendSarohBusinessEmail(email),
): Promise<boolean> {
    if (!(await sarohSwitchesOn(message.organizationId))) {
        await record(deliveryId, message.id, {
            delivery: SAROH_STOPPED,
            message: "FAILED",
            error: "Saroh's email for businesses was switched off before it went",
        });
        return false;
    }
    // A booking notice carries no secret link; one that waits for a slot
    // has nothing to fill it with here.
    if (message.body.includes(SECRET_LINK_SLOT)) {
        await record(deliveryId, message.id, {
            delivery: SAROH_STOPPED,
            message: "FAILED",
            error: "secret link missing",
        });
        return false;
    }

    // The name and the reply address as they are now, not as queued.
    const [org, profile] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: message.organizationId },
            select: { name: true, slug: true },
        }),
        prisma.businessProfile.findUnique({
            where: { organizationId: message.organizationId },
            select: { contactEmail: true },
        }),
    ]);
    const outcome = await send({
        organizationId: message.organizationId,
        businessName: org?.name ?? "",
        fallbackName: org?.slug ?? "Saroh",
        contactEmail: profile?.contactEmail ?? null,
        to: message.toAddress,
        subject: message.subject ?? "",
        html: message.body,
    });

    switch (outcome) {
        case "sent":
            await record(deliveryId, message.id, {
                delivery: "SENT",
                message: "SENT",
                error: null,
            });
            return true;
        case "unknown":
            await record(deliveryId, message.id, {
                delivery: SAROH_UNKNOWN,
                message: SAROH_UNKNOWN,
                error: "The connection dropped after the email was handed over; not retried, in case it went",
            });
            return false;
        case "not-configured":
        case "failed": {
            const error =
                outcome === "not-configured"
                    ? "Saroh's email isn't set up on this server"
                    : "Saroh's email couldn't send it";
            await record(deliveryId, message.id, {
                delivery: "FAILED",
                message: "FAILED",
                error,
            });
            throw new Error(error);
        }
        default: {
            // A new outcome is a compile error here until it is handled.
            const unhandled: never = outcome;
            throw new Error(
                `unhandled Saroh send outcome ${String(unhandled)}`,
            );
        }
    }
}

async function record(
    deliveryId: string,
    messageId: string,
    to: { delivery: string; message: string; error: string | null },
): Promise<void> {
    await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
            status: to.delivery,
            error: to.error,
            attempts: { increment: 1 },
        },
    });
    await prisma.message.update({
        where: { id: messageId },
        data: { status: to.message },
    });
}
