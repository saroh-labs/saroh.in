import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { CustomerDataRequestStatus, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, auditMetadata } from "../audit/audit.service";
import { enqueueDataRequestEmail } from "../site-accounts/data-request-email.handler";
import { requireCustomerPower } from "./customer-access";
import type { DataRequestFilter } from "./data-requests.dto";
import { fullName } from "./merge-plan";

/**
 * Customers' "Ask to remove my data" requests, for the business (DEC-172,
 * #1106; site templates v2 plan, U13): the list, and closing one without
 * removal, with a reason.
 *
 * Anyone who can run a customer removal (`customer:remove`, as
 * `privacy-removal.service.ts`) sees and acts on requests, and nobody else
 * (owner decision, 20 Oct). A request in another business is a 404.
 *
 * DONE is never set here: the privacy removal records it, in its own
 * transaction (`privacy-removal-writes.ts`, `markRequestsDoneInTx`), so a
 * request reads done only when the removal really ran. A request whose
 * contact is gone (unlinked, or never linked) is listed too: the business
 * finds the customer by the email they asked from, then runs the removal or
 * closes it.
 */

export interface DataRequestRow {
    id: string;
    kind: "REMOVAL";
    status: CustomerDataRequestStatus;
    askedAt: string;
    handledAt: string | null;
    /** Why it was closed without removal; null otherwise. */
    reason: string | null;
    /** The customer to open; null once removed, or when none is linked. */
    contactId: string | null;
    /**
     * Their name now, else as they gave it when they asked. Null once done:
     * the list says "A removed customer" (review #19).
     */
    name: string | null;
    /**
     * The email they asked from, to find them by. Null once done: the
     * request is kept as the record, and the business needs it no more.
     */
    email: string | null;
}

/** The newest first, at most this many: requests are rare. */
export const DATA_REQUESTS_LIMIT = 200;

const STATUS_OF: Record<
    Exclude<DataRequestFilter, "all">,
    CustomerDataRequestStatus
> = {
    open: "OPEN",
    done: "DONE",
    closed: "CLOSED_WITHOUT_REMOVAL",
};

const ROW_SELECT = {
    id: true,
    kind: true,
    status: true,
    createdAt: true,
    handledAt: true,
    reason: true,
    contactId: true,
    requesterName: true,
    requesterEmail: true,
    contact: {
        select: { firstName: true, lastName: true, removedAt: true },
    },
} satisfies Prisma.CustomerDataRequestSelect;

type Selected = Prisma.CustomerDataRequestGetPayload<{
    select: typeof ROW_SELECT;
}>;

export function dataRequestRow(row: Selected): DataRequestRow {
    const live = row.contact && !row.contact.removedAt ? row.contact : null;
    const done = row.status === "DONE";
    const name = done
        ? null
        : ((live ? fullName(live) : null) ?? row.requesterName ?? null);
    return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        askedAt: row.createdAt.toISOString(),
        handledAt: row.handledAt?.toISOString() ?? null,
        reason: row.status === "CLOSED_WITHOUT_REMOVAL" ? row.reason : null,
        contactId: live ? row.contactId : null,
        name,
        email: done ? null : row.requesterEmail,
    };
}

@Injectable()
export class DataRequestsService {
    async list(
        ctx: OrganizationContext,
        filter: DataRequestFilter = "open",
    ): Promise<{ requests: DataRequestRow[] }> {
        requireCustomerPower(ctx, "customer:remove");
        const rows = await prisma.customerDataRequest.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(filter === "all" ? {} : { status: STATUS_OF[filter] }),
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: DATA_REQUESTS_LIMIT,
            select: ROW_SELECT,
        });
        return { requests: rows.map(dataRequestRow) };
    }

    /** Close an open request without removal, with a reason. */
    async close(
        ctx: OrganizationContext,
        requestId: string,
        reason: string,
        now: Date = new Date(),
    ): Promise<DataRequestRow> {
        requireCustomerPower(ctx, "customer:remove");
        const organizationId = ctx.organizationId;
        return prisma.$transaction(async (tx) => {
            // Under the request's lock, so a removal marking it done and a
            // close can't both win.
            const locked = await tx.$queryRaw<{ status: string }[]>`
                SELECT status::text AS status FROM "CustomerDataRequest"
                WHERE id = ${requestId} AND "organizationId" = ${organizationId}
                FOR UPDATE`;
            if (locked.length === 0) {
                throw new NotFoundException("Request not found");
            }
            const found = locked[0];
            if (found.status !== "OPEN") {
                throw new ConflictException({
                    message:
                        found.status === "DONE"
                            ? "Their details were already removed."
                            : "This request was already closed.",
                    details: { reason: "not-open" },
                });
            }
            const row = await tx.customerDataRequest.update({
                where: { id: requestId },
                data: {
                    status: "CLOSED_WITHOUT_REMOVAL",
                    reason,
                    handledByUserId: ctx.userId,
                    handledAt: now,
                },
                select: ROW_SELECT,
            });
            // The customer is told it was closed, never the reason.
            await enqueueDataRequestEmail(tx, organizationId, {
                requestId,
                step: "closed",
            });
            await tx.auditEvent.create({
                data: {
                    action: AuditAction.CustomerDataRequestClosed,
                    actorUserId: ctx.userId,
                    organizationId,
                    targetType: "customer_data_request",
                    targetId: requestId,
                    outcome: "SUCCESS",
                    // Ids only; the reason stays on the request.
                    metadata: auditMetadata(ctx.roleKey, {
                        contactId: row.contactId,
                    }),
                },
            });
            return dataRequestRow(row);
        });
    }
}
