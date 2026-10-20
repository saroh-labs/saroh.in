import { HttpException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allows, authorize } from "../organizations/organization-policy";
import { assertBusinessDetails } from "./business-details";
import { reminderSample } from "./invoice-reminder-sample";
import type { EmailBlocker, SendRow } from "./invoice-send.service";
import { InvoiceSendService, SEND_SELECT } from "./invoice-send.service";
import type { BulkRemindersDto } from "./invoice-share.dto";
import { BULK_REMINDER_MAX } from "./invoice-share.dto";
import { leftToPayCents } from "./invoice-state";
import type { LastHeard } from "./overdue-bills";
import { daysAgo, heardWords, lastHeardFrom } from "./overdue-bills";
import { fromCents } from "./totals";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How one invoice's reminder goes in Remind many. */
export type ReminderWay = "EMAIL" | "WHATSAPP" | "WAIT" | "NONE";

/**
 * Why, for each way:
 * - WHATSAPP: why not email (`EmailBlocker`);
 * - WAIT: `REMINDED_TODAY`, with `retryAt`; or, when the call asked for
 *   `quietDays`, `REMINDED_RECENTLY`: sent or reminded inside them;
 * - NONE: not one of the business's invoices (`NOT_FOUND`), not owed
 *   (`DRAFT`, `PAID`, `ORDER`, `NOT_OWED` for void, credited or a credit
 *   note), an autopay charge under way (`AUTOPAY_PENDING`), or no way to
 *   reach them at all (`UNREACHABLE`, with `emailBlocked` saying why email
 *   can't go, and no phone).
 */
export type ReminderReason =
    | EmailBlocker
    | "REMINDED_TODAY"
    | "REMINDED_RECENTLY"
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
    /**
     * What is left to pay, as a Decimal string, and its currency. Absent
     * for a role without `payment:read` (DEC-098).
     */
    leftToPay?: string;
    currency?: string;
    /** When it was due, and how many whole days late in the business's zone. */
    dueAt?: string | null;
    lateDays?: number;
    /**
     * When it was last sent or reminded, in the last `quietDays` (or the
     * last day), and in words: "Reminded yesterday", "Sent 2 days ago".
     */
    lastAt?: string;
    lastWords?: string;
}

/** The preview: each invoice, and the words the first email one gets. */
export interface ReminderPreview {
    invoices: ReminderPreviewRow[];
    /**
     * The reminder email the first EMAIL row's customer gets, as plain
     * words, its link named ("What they get"). Null when none goes by
     * email, and for a role without `payment:read`: it names the amount.
     */
    message: string | null;
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
 * (one reminder a day); with `quietDays` (Home's Remind all asks 3,
 * DEC-171), anyone sent or reminded inside them waits too, as
 * `REMINDED_RECENTLY`, read again at Send so one reminded elsewhere while
 * the business's Undo ran is not sent twice. Drafts, paid and order invoices, and ids that
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
    ): Promise<ReminderPreview> {
        authorize(ctx, "invoice:write");
        const now = new Date();
        const { rows, found, zone } = await this.read(ctx, dto, now);
        const money = allows(ctx, "payment:read");
        const first = rows.find((r) => r.way === "EMAIL");
        const firstRow = first ? found.get(first.invoiceId) : undefined;
        const message =
            money && first && firstRow
                ? await reminderSample(
                      ctx.organizationId,
                      firstRow.row,
                      firstRow.payOnline,
                      zone,
                      now,
                  )
                : null;
        return { invoices: rows.map((r) => shown(r, money)), message };
    }

    async send(
        ctx: OrganizationContext,
        dto: BulkRemindersDto,
    ): Promise<{ invoices: ReminderSendRow[] }> {
        authorize(ctx, "invoice:write");
        // Every reminder carries a link that asks to be paid (DEC-068):
        // the business's details are the business's, so one refusal.
        await assertBusinessDetails(prisma, ctx.organizationId);
        const money = allows(ctx, "payment:read");
        const { rows } = await this.read(ctx, dto, new Date());
        const results: ReminderSendRow[] = [];
        for (const row of rows) {
            if (row.way !== "EMAIL") {
                results.push({ ...shown(row, money), outcome: "NOT_SENT" });
                continue;
            }
            try {
                const sent = await this.sending.remind(ctx, row.invoiceId);
                results.push({
                    ...shown(row, money),
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
                    ...shown(row, money),
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

    /**
     * How each picked invoice would go, in the order they were picked,
     * with each found row and whether its link is a pay link (for the
     * sample's words).
     */
    private async read(
        ctx: OrganizationContext,
        dto: BulkRemindersDto,
        now: Date,
    ): Promise<{
        rows: ReminderPreviewRow[];
        found: Map<string, { row: SendRow; payOnline: boolean }>;
        zone: string;
    }> {
        const ids = [...new Set(dto.invoiceIds)].slice(0, BULK_REMINDER_MAX);
        const [found, zone] = await Promise.all([
            prisma.invoice.findMany({
                where: { id: { in: ids }, organizationId: ctx.organizationId },
                select: SEND_SELECT,
            }),
            this.sending.zone(prisma, ctx.organizationId),
        ]);
        const byId = new Map(found.map((row) => [row.id, row]));
        // Sent or reminded inside the quiet days the call asked for, read
        // for them all at once: the same three things one a day counts.
        const quiet = dto.quietDays ?? 0;
        const heard =
            quiet > 0
                ? await lastHeardFrom(
                      prisma,
                      ctx.organizationId,
                      found.map((r) => r.id),
                      new Date(now.getTime() - quiet * DAY_MS),
                  )
                : new Map<string, LastHeard>();
        const rows: ReminderPreviewRow[] = [];
        const kept = new Map<string, { row: SendRow; payOnline: boolean }>();
        for (const id of ids) {
            const row = byId.get(id);
            if (!row) {
                rows.push({ invoiceId: id, way: "NONE", reason: "NOT_FOUND" });
                continue;
            }
            const { out, payOnline } = await this.way(
                ctx.organizationId,
                row,
                now,
                zone,
                quiet > 0 ? { days: quiet, last: heard.get(id) } : null,
            );
            rows.push(out);
            kept.set(id, { row, payOnline });
        }
        return { rows, found: kept, zone };
    }

    private async way(
        organizationId: string,
        row: SendRow,
        now: Date,
        zone: string,
        quiet: { days: number; last: LastHeard | undefined } | null,
    ): Promise<{ out: ReminderPreviewRow; payOnline: boolean }> {
        const base = {
            invoiceId: row.id,
            number: row.number,
            name: nameOf(row),
            leftToPay: fromCents(leftToPayCents(row)),
            currency: row.currency,
            dueAt: row.dueAt?.toISOString() ?? null,
            lateDays:
                row.dueAt && row.dueAt < now
                    ? Math.max(1, daysAgo(row.dueAt, now, zone))
                    : 0,
        };
        const none = (reason: ReminderReason) => ({
            out: { ...base, way: "NONE", reason } satisfies ReminderPreviewRow,
            payOnline: false,
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
        const payOnline = reach.send.payOnline;
        const phone = reach.phone ? { phone: reach.phone } : {};
        const last = quiet?.last
            ? {
                  lastAt: quiet.last.at.toISOString(),
                  lastWords: heardWords(quiet.last, now, zone),
              }
            : {};
        const go = (out: ReminderPreviewRow) => ({ out, payOnline });
        if (reach.send.nextReminderAt) {
            return go({
                ...base,
                ...phone,
                ...last,
                way: "WAIT",
                reason: "REMINDED_TODAY",
                retryAt: reach.send.nextReminderAt,
            });
        }
        if (quiet?.last) {
            return go({
                ...base,
                ...phone,
                ...last,
                way: "WAIT",
                reason: "REMINDED_RECENTLY",
                retryAt: new Date(
                    quiet.last.at.getTime() + quiet.days * DAY_MS,
                ).toISOString(),
            });
        }
        if (reach.emailTo) {
            return go({
                ...base,
                ...phone,
                way: "EMAIL",
                reason: null,
                email: reach.emailTo,
            });
        }
        if (reach.phone) {
            return go({
                ...base,
                phone: reach.phone,
                way: "WHATSAPP",
                reason: reach.emailBlocked,
            });
        }
        return go({
            ...base,
            way: "NONE",
            reason: "UNREACHABLE",
            ...(reach.emailBlocked ? { emailBlocked: reach.emailBlocked } : {}),
        });
    }
}

/** A row as this viewer may see it: no amount without `payment:read`. */
function shown<T extends ReminderPreviewRow>(row: T, money: boolean): T {
    if (money) return row;
    const { leftToPay: _amount, ...rest } = row;
    return rest as T;
}

function nameOf(row: SendRow): string | null {
    const name =
        row.billToName ??
        [row.contact?.firstName, row.contact?.lastName]
            .filter(Boolean)
            .join(" ");
    return name.trim() || null;
}
