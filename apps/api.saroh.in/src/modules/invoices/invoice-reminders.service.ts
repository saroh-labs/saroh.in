import { HttpException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { assertBusinessDetails } from "./business-details";
import type { EmailBlocker, SendRow } from "./invoice-send.service";
import { InvoiceSendService, SEND_SELECT } from "./invoice-send.service";
import type { BulkRemindersDto } from "./invoice-share.dto";
import { BULK_REMINDER_MAX } from "./invoice-share.dto";
import { leftToPayCents } from "./invoice-state";
import { fromCents } from "./totals";

/** How one invoice's reminder goes in Remind many. */
export type ReminderWay = "EMAIL" | "WHATSAPP" | "WAIT" | "NONE";

/**
 * Why, for each way:
 * - WHATSAPP: why not email (`EmailBlocker`);
 * - WAIT: `REMINDED_TODAY`, with `retryAt`;
 * - NONE: not one of the business's invoices (`NOT_FOUND`), not owed
 *   (`DRAFT`, `PAID`, `ORDER`, `NOT_OWED` for void, credited or a credit
 *   note), an autopay charge under way (`AUTOPAY_PENDING`), or no way to
 *   reach them at all (`UNREACHABLE`, with `emailBlocked` saying why email
 *   can't go, and no phone).
 */
export type ReminderReason =
    | EmailBlocker
    | "REMINDED_TODAY"
    | "NOT_FOUND"
    | "DRAFT"
    | "PAID"
    | "ORDER"
    | "NOT_OWED"
    | "AUTOPAY_PENDING"
    | "UNREACHABLE";

/** One invoice in the preview. */
export interface ReminderPreviewRow {
    invoiceId: string;
    way: ReminderWay;
    reason: ReminderReason | null;
    /** WAIT: when the next reminder may go. */
    retryAt?: string;
    /** EMAIL: where it goes. */
    email?: string;
    /** WHATSAPP (and any row with one): the phone, E.164. */
    phone?: string;
    /** UNREACHABLE: why email can't go either. */
    emailBlocked?: EmailBlocker;
    /** Who and what, for the sheet's lines; absent for NOT_FOUND. */
    number?: string | null;
    name?: string | null;
    /** What is left to pay, as a Decimal string, and its currency. */
    leftToPay?: string;
    currency?: string;
}

/** One invoice's outcome after Send. */
export interface ReminderSendRow extends ReminderPreviewRow {
    /**
     * EMAILED: the reminder was queued (or SUPPRESSED, they turned email
     * off since); FAILED: refused as it went (`message` says why);
     * otherwise the preview's way stands: WhatsApp is opened one at a time
     * by the business (`POST :invoiceId/share`), WAIT and NONE aren't sent.
     */
    outcome: "EMAILED" | "SUPPRESSED" | "FAILED" | "NOT_SENT";
    message?: string;
}

/**
 * Remind many, by channel (DEC-173, U5 #1117; INVBulkSend). The preview
 * says how each picked invoice's reminder would go:
 *
 * 1. **Email** when it can go: the business's own provider is connected,
 *    there is an address and the customer hasn't turned email off.
 * 2. Else **WhatsApp** when there is a phone (one tap each, by the
 *    business: Saroh sends nothing on WhatsApp).
 * 3. Else **none**, with the reason, so the sheet names who can't be
 *    reached by any channel.
 *
 * A customer reminded today, either way, **waits**, with `retryAt`
 * (one reminder a day). Drafts, paid and order invoices, and ids that
 * aren't the business's, are each refused with a reason, never a failure
 * for the lot. Send emails the EMAIL ones, each exactly as `remind` does
 * (its own transaction, lock and one-a-day check), and answers per
 * invoice. At most {@link BULK_REMINDER_MAX} at a time.
 *
 * Who may: `invoice:write`, the check `remind` makes.
 */
@Injectable()
export class InvoiceRemindersService {
    constructor(private readonly sending: InvoiceSendService) {}

    async preview(
        ctx: OrganizationContext,
        dto: BulkRemindersDto,
    ): Promise<{ invoices: ReminderPreviewRow[] }> {
        authorize(ctx, "invoice:write");
        return { invoices: await this.ways(ctx, dto.invoiceIds, new Date()) };
    }

    async send(
        ctx: OrganizationContext,
        dto: BulkRemindersDto,
    ): Promise<{ invoices: ReminderSendRow[] }> {
        authorize(ctx, "invoice:write");
        // Every reminder carries a link that asks to be paid (DEC-068):
        // the business's details are the business's, so one refusal.
        await assertBusinessDetails(prisma, ctx.organizationId);
        const rows = await this.ways(ctx, dto.invoiceIds, new Date());
        const results: ReminderSendRow[] = [];
        for (const row of rows) {
            if (row.way !== "EMAIL") {
                results.push({ ...row, outcome: "NOT_SENT" });
                continue;
            }
            try {
                const sent = await this.sending.remind(ctx, row.invoiceId);
                results.push({
                    ...row,
                    outcome:
                        sent.email?.status === "SUPPRESSED"
                            ? "SUPPRESSED"
                            : "EMAILED",
                });
            } catch (error) {
                if (!(error instanceof HttpException)) throw error;
                const body = error.getResponse() as
                    | { message?: unknown; details?: { retryAt?: unknown } }
                    | string;
                const message =
                    typeof body === "string"
                        ? body
                        : typeof body.message === "string"
                          ? body.message
                          : error.message;
                const retryAt =
                    typeof body === "object" &&
                    typeof body.details?.retryAt === "string"
                        ? body.details.retryAt
                        : undefined;
                results.push({
                    ...row,
                    ...(retryAt
                        ? { way: "WAIT", reason: "REMINDED_TODAY", retryAt }
                        : {}),
                    outcome: "FAILED",
                    message,
                });
            }
        }
        return { invoices: results };
    }

    /** How each picked invoice would go, in the order they were picked. */
    private async ways(
        ctx: OrganizationContext,
        invoiceIds: string[],
        now: Date,
    ): Promise<ReminderPreviewRow[]> {
        const ids = [...new Set(invoiceIds)].slice(0, BULK_REMINDER_MAX);
        const found = await prisma.invoice.findMany({
            where: { id: { in: ids }, organizationId: ctx.organizationId },
            select: SEND_SELECT,
        });
        const byId = new Map(found.map((row) => [row.id, row]));
        const out: ReminderPreviewRow[] = [];
        for (const id of ids) {
            const row = byId.get(id);
            out.push(
                row
                    ? await this.way(ctx.organizationId, row, now)
                    : { invoiceId: id, way: "NONE", reason: "NOT_FOUND" },
            );
        }
        return out;
    }

    private async way(
        organizationId: string,
        row: SendRow,
        now: Date,
    ): Promise<ReminderPreviewRow> {
        const base = {
            invoiceId: row.id,
            number: row.number,
            name: nameOf(row),
            leftToPay: fromCents(leftToPayCents(row)),
            currency: row.currency,
        };
        const none = (reason: ReminderReason): ReminderPreviewRow => ({
            ...base,
            way: "NONE",
            reason,
        });
        if (row.orderId) return none("ORDER");
        if (row.kind === "CREDIT_NOTE") return none("NOT_OWED");
        if (row.status === "DRAFT") return none("DRAFT");
        if (row.status === "PAID") return none("PAID");
        if (row.status !== "ISSUED") return none("NOT_OWED");

        const reach = await this.sending.channelsFor(
            prisma,
            organizationId,
            row,
            now,
        );
        if (reach.send.reason === "AUTOPAY_PENDING") {
            return none("AUTOPAY_PENDING");
        }
        const phone = reach.phone ? { phone: reach.phone } : {};
        if (reach.send.nextReminderAt) {
            return {
                ...base,
                ...phone,
                way: "WAIT",
                reason: "REMINDED_TODAY",
                retryAt: reach.send.nextReminderAt,
            };
        }
        if (reach.emailTo) {
            return {
                ...base,
                ...phone,
                way: "EMAIL",
                reason: null,
                email: reach.emailTo,
            };
        }
        if (reach.phone) {
            return {
                ...base,
                phone: reach.phone,
                way: "WHATSAPP",
                reason: reach.emailBlocked,
            };
        }
        return {
            ...none("UNREACHABLE"),
            ...(reach.emailBlocked ? { emailBlocked: reach.emailBlocked } : {}),
        };
    }
}

function nameOf(row: SendRow): string | null {
    const name =
        row.billToName ??
        [row.contact?.firstName, row.contact?.lastName]
            .filter(Boolean)
            .join(" ");
    return name.trim() || null;
}
