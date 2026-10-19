import type { Prisma } from "@saroh/database";

import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * A customer asked the business to remove their data (DEC-172, #1106):
 * the team's alert, queued with the request (`team.alert`
 * `{ event: "request" }`), on its own row in Settings › Your profile, offered
 * to whoever can run a customer removal (`customer:remove`), with email on
 * by default.
 *
 * The bell names the customer, as an enquiry's does; Saroh's email names
 * nobody and carries no customer's words (DEC-011 as amended 2026-10-07).
 * A request closed or done before the run is not announced.
 */

export const DATA_REQUEST_NOTIFICATION_TYPE = "customer.data-request" as const;

/** Where the merchant reviews requests (U14 adds the Requests tab). */
export const REQUESTS_PATH = "/commerce/customers?tab=requests";

type Tx = Prisma.TransactionClient;

export async function wordDataRequest(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "request" }>,
): Promise<WordedAlert | null> {
    const request = await tx.customerDataRequest.findFirst({
        where: { id: p.requestId, organizationId },
        select: {
            id: true,
            status: true,
            contactId: true,
            requesterName: true,
            contact: {
                select: { firstName: true, lastName: true, removedAt: true },
            },
        },
    });
    if (request?.status !== "OPEN") return null;
    const contactId =
        request.contact && !request.contact.removedAt
            ? request.contactId
            : null;
    const fromContact = [request.contact?.firstName, request.contact?.lastName]
        .map((part) => part?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    // The contact's name now; else the name they had when they asked.
    const named = contactId ? fromContact : "";
    const kept = request.requesterName?.trim() ?? "";
    const who = named !== "" ? named : kept !== "" ? kept : "A customer";
    return {
        event: "request",
        eventKey: `team:request:${request.id}`,
        notificationId: null,
        ...noticeOf(DATA_REQUEST_NOTIFICATION_TYPE, { contactId }),
        title: `${who} asked to remove their data`,
        body: "Review the removal from their customer page, or close the request with a reason. Receipts and invoices are kept as the law requires.",
        mail: {
            heading: "A customer asked to remove their data",
            body: "Open it in Saroh to see who. Review the removal from their customer page, or close the request with a reason. Receipts and invoices are kept as the law requires.",
        },
        path: contactId
            ? `/contacts/${encodeURIComponent(contactId)}`
            : REQUESTS_PATH,
        skipUserId: null,
        cta: "Review the request",
    };
}
