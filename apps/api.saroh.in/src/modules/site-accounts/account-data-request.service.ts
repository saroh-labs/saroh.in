import {
    HttpException,
    HttpStatus,
    Injectable,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AuditAction } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import type { CustomerContext } from "./customer-context.decorator";
import type { AccountDataRequest } from "./customer-view";
import { accountDataRequestView } from "./customer-view";
import { enqueueDataRequestEmail } from "./data-request-email.handler";

/**
 * "Ask to remove my data" from a customer's own account (DEC-172, #1106;
 * site templates v2 plan, U13). Nothing is deleted when they ask: the
 * request is a row the business sees, as a team alert and in Customers, and
 * acts on through the existing privacy removal, which marks it DONE in its
 * own transaction (`customer-workspace/privacy-removal-writes.ts`), or
 * closes without removal, with a reason (`customer-workspace/
 * data-requests.service.ts`).
 *
 * Asking is idempotent: while one is open, asking again returns it (the
 * partial unique `CustomerDataRequest_one_open_per_account` holds it, and
 * the account's row lock serialises two at once). A new request, once an
 * earlier one was closed, is limited twice over: hits per account per
 * process ({@link ASKS_PER_WINDOW}), and new rows per account per day
 * ({@link NEW_REQUESTS_PER_DAY}, counted in the database, so a deploy or a
 * second instance doesn't reset it). Each new row tells Saroh's two
 * listeners on the same transaction: the team (`team.alert`) and the
 * customer's acknowledgement (`customer.data-request.email`); and writes
 * `customer.data_request.created` with ids only.
 */

/** Asks per account per window, per API process. */
export const ASKS_PER_WINDOW = 5;
export const ASK_WINDOW_MS = 10 * 60_000;
/** New requests per account in a day. */
export const NEW_REQUESTS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60_000;

/** Who made the audit entry: the customer, who is not a user. */
export const SITE_ACCOUNT_ACTOR = "system:site-account";

export interface AskedDataRequest {
    request: AccountDataRequest;
    /** False when an open one was already there. */
    created: boolean;
}

function tooMany(): HttpException {
    return new HttpException(
        {
            message:
                "You've asked several times already. Try again tomorrow, or contact the business.",
            details: { reason: "too-many" },
        },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}

@Injectable()
export class AccountDataRequestService {
    constructor(
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            ASKS_PER_WINDOW,
            ASK_WINDOW_MS,
        ),
    ) {}

    /** Their latest request, open or closed; null when they never asked. */
    async current(
        customer: CustomerContext,
    ): Promise<{ request: AccountDataRequest | null }> {
        const row = await prisma.customerDataRequest.findFirst({
            where: {
                organizationId: customer.organizationId,
                customerAccountId: customer.accountId,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
                id: true,
                status: true,
                createdAt: true,
                handledAt: true,
            },
        });
        return { request: row ? accountDataRequestView(row) : null };
    }

    /** Ask the business to remove their data; the open request if there is one. */
    async ask(
        customer: CustomerContext,
        now: Date = new Date(),
    ): Promise<AskedDataRequest> {
        if (!this.limiter.take(customer.accountId, now.getTime())) {
            throw tooMany();
        }
        const { organizationId, accountId } = customer;
        return prisma.$transaction(async (tx) => {
            // One at a time per account: a second ask waits here, then
            // finds the first one's request.
            const locked = await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "CustomerAccount"
                WHERE id = ${accountId} AND "organizationId" = ${organizationId}
                FOR UPDATE`;
            if (locked.length === 0) {
                throw new HttpException(
                    "Sign in to continue.",
                    HttpStatus.UNAUTHORIZED,
                );
            }
            const select = {
                id: true,
                status: true,
                createdAt: true,
                handledAt: true,
            } as const;
            const open = await tx.customerDataRequest.findFirst({
                where: {
                    organizationId,
                    customerAccountId: accountId,
                    status: "OPEN",
                },
                select,
            });
            if (open) {
                return {
                    request: accountDataRequestView(open),
                    created: false,
                };
            }
            const recent = await tx.customerDataRequest.count({
                where: {
                    organizationId,
                    customerAccountId: accountId,
                    createdAt: { gte: new Date(now.getTime() - DAY_MS) },
                },
            });
            if (recent >= NEW_REQUESTS_PER_DAY) throw tooMany();

            const account = await tx.customerAccount.findFirst({
                where: { id: accountId, organizationId },
                select: {
                    email: true,
                    contactId: true,
                    contact: { select: { firstName: true, lastName: true } },
                },
            });
            if (!account) {
                throw new HttpException(
                    "Sign in to continue.",
                    HttpStatus.UNAUTHORIZED,
                );
            }
            const name = [account.contact.firstName, account.contact.lastName]
                .map((part) => part?.trim() ?? "")
                .filter(Boolean)
                .join(" ");
            const row = await tx.customerDataRequest.create({
                data: {
                    organizationId,
                    customerAccountId: accountId,
                    contactId: account.contactId,
                    requesterName: name === "" ? null : name,
                    requesterEmail: account.email,
                    createdAt: now,
                },
                select,
            });
            await enqueueTeamAlert(tx, organizationId, {
                event: "request",
                requestId: row.id,
            });
            await enqueueDataRequestEmail(tx, organizationId, {
                requestId: row.id,
                step: "received",
            });
            await tx.auditEvent.create({
                data: {
                    action: AuditAction.CustomerDataRequestCreated,
                    actorUserId: SITE_ACCOUNT_ACTOR,
                    organizationId,
                    targetType: "customer_data_request",
                    targetId: row.id,
                    outcome: "SUCCESS",
                    // Ids only: never a name or an email.
                    metadata: { accountId, contactId: account.contactId },
                },
            });
            return { request: accountDataRequestView(row), created: true };
        });
    }
}
