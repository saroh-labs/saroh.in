import type { Prisma } from "@saroh/database";

import type { NoticeVars } from "../site-accounts/notify-templates";
import { renderSarohNotice } from "../site-accounts/saroh-notice";
import type { MessageSendPayload } from "./message-send.handler";
import { MESSAGE_SEND_TYPE } from "./message-send.handler";
import { SAROH_PROVIDER, SAROH_SEND_ATTEMPTS } from "./saroh-delivery";
import type { RenderedMessage } from "./transactional";

type Tx = Prisma.TransactionClient;

/**
 * The Saroh branch of `queueTransactional` (DEC-086): a booking notice for
 * a business with no email of its own, worded for Saroh's address and
 * queued as a `SAROH` delivery. `message.send` honours that stamp (a
 * provider connected meanwhile doesn't send it twice), re-checks the
 * switches, and hands it to Saroh's sender.
 */

/** The Message columns `queueTransactional` has worked out. */
export interface QueuedMessageBase {
    organizationId: string;
    channel: string;
    contactId: string | null;
    toAddress: string;
    subject: string;
    body: string;
    createdByUserId: string | null;
    invoiceId: string | null;
    template: string;
}

/** What a queued Saroh send returns, as `queueTransactional` does. */
export interface SarohQueued {
    id: string;
    status: "QUEUED";
    toAddress: string;
    route: "SAROH";
}

/**
 * The notice as Saroh sends it: names cleaned, Saroh's footer. Reads the
 * business's slug (the name's stand-in), contact email and phone now.
 */
export async function renderForSaroh(
    tx: Pick<Tx, "organization" | "businessProfile">,
    organizationId: string,
    input: { notice: NoticeVars },
): Promise<RenderedMessage> {
    const [org, profile] = await Promise.all([
        tx.organization.findUnique({
            where: { id: organizationId },
            select: { slug: true },
        }),
        tx.businessProfile.findUnique({
            where: { organizationId },
            select: { contactEmail: true, phone: true },
        }),
    ]);
    const words = renderSarohNotice(input.notice, {
        fallbackName: org?.slug ?? "",
        contactEmail: profile?.contactEmail ?? null,
        phone: profile?.phone ?? null,
    });
    if (!words) {
        // Only booking notices reach here (`sarohMaySend`); anything else
        // is a bug, and must not go from Saroh's address.
        throw new Error("Only a booking notice can go through Saroh");
    }
    return words;
}

/** Message + `SAROH` Delivery + `message.send` job, on the caller's transaction. */
export async function queueSarohInTx(
    tx: Pick<Tx, "message" | "delivery" | "job">,
    organizationId: string,
    base: QueuedMessageBase,
): Promise<SarohQueued> {
    const message = await tx.message.create({
        data: { ...base, status: "QUEUED" },
    });
    const delivery = await tx.delivery.create({
        data: {
            organizationId,
            messageId: message.id,
            provider: SAROH_PROVIDER,
            status: "QUEUED",
        },
    });
    const payload: MessageSendPayload = {
        messageId: message.id,
        deliveryId: delivery.id,
    };
    await tx.job.create({
        data: {
            organizationId,
            type: MESSAGE_SEND_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            maxAttempts: SAROH_SEND_ATTEMPTS,
        },
    });
    return {
        id: message.id,
        status: "QUEUED",
        toAddress: base.toAddress,
        route: "SAROH",
    };
}
