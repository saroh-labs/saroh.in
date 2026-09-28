import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { InvoiceSendService } from "../invoices/invoice-send.service";
import type { OrderStage } from "../orders/dto";
import { nextStages } from "../orders/order-stage";
import { accountAreaOn } from "../site-accounts/account-area";
import { orderContactId } from "../site-accounts/customer-notify.handler";
import type { NoticeReach } from "../site-accounts/notice-reach";
import { contactReach, hasLiveAccount } from "../site-accounts/notice-reach";
import { orderNoticeKind } from "../site-accounts/notify-templates";
import {
    firstNameOf,
    markSentWords,
    reminderWords,
    replyWords,
    retryWords,
} from "./home-inline-words";
import type {
    HomeAction,
    HomeEvidence,
    HomeInput,
    HomeRetryVia,
} from "./home-model";
import { holds } from "./home-model";

/**
 * Needs you's inline actions (round 2, F4): which rows offer Mark sent,
 * Retry, Send reminder or Reply in place, and what each says. Read after
 * the sources and before the list is flattened, so the action rides on
 * the row's evidence into `HomeNeed.inline`.
 *
 * An action is offered only to a viewer who holds the target's own write,
 * and only when that write can take it now (the order's next step is its
 * handover; the renewal is past due and a pay link can be made; the
 * invoice's send flag names a channel and no reminder went today; the
 * account area is on). Anything else leaves the row a link to the record,
 * where the full set of choices is. Each action calls the target's own
 * endpoint; Home has no write of its own.
 *
 * It never fails Home: a read that fails here leaves that source's rows as
 * links and is logged, since every row still works without its button.
 */

type Db = typeof prisma;

/** The steps "Mark sent" moves an order to: the handover of each type. */
const SENT_STAGES: readonly OrderStage[] = [
    "HANDED_TO_COURIER",
    "OUT_FOR_DELIVERY",
    "SENT",
];

/** Reads the actions need, injectable so the unit specs can hand in fakes. */
export interface InlinePorts {
    /** An order's reach for its step notices (A14), or null if unknown. */
    orderReach: (
        organizationId: string,
        order: { customerId: string | null; customerAccountId: string | null },
    ) => Promise<NoticeReach | null>;
    /** Whether a contact has a live site account (A13's "signs in"). */
    signsIn: (organizationId: string, contactId: string) => Promise<boolean>;
}

@Injectable()
export class HomeInlineService {
    private readonly logger = new Logger(HomeInlineService.name);

    constructor(
        // Optional so a spec can build Home without invoices: without it
        // no row offers Send reminder.
        @Optional() private readonly sending?: InvoiceSendService,
        @Optional() private readonly db: Db = prisma,
        @Optional() private readonly ports: InlinePorts = defaultPorts(prisma),
    ) {}

    /** Put each offered action on its row's evidence, in place. */
    async decorate(
        actions: readonly HomeAction[],
        input: HomeInput,
        now: Date,
    ): Promise<void> {
        const of = (code: string) =>
            actions.find((a) => a.code === code)?.evidence ?? [];
        await Promise.all([
            this.step("Mark sent", () =>
                this.markSent(of("COMMERCE_OPEN_ORDERS"), input),
            ),
            this.step("Retry", () =>
                this.retry(of("PAYMENTS_FAILED_RENEWALS"), input, now),
            ),
            this.step("Send reminder", () =>
                this.remind(of("PAYMENTS_OVERDUE_INVOICES"), input, now),
            ),
            this.step("Reply", () =>
                this.reply(of("CRM_UNANSWERED_MESSAGES"), input),
            ),
        ]);
    }

    private async step(name: string, run: () => Promise<void>) {
        try {
            await run();
        } catch (error) {
            this.logger.warn(
                `Home's inline "${name}" couldn't be read, so its rows stay links: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    /**
     * Mark sent: `order:stage`, on an order whose next step is its handover
     * (READY → handed to the courier or out for delivery; a paid digital
     * order → sent). The confirm says how A14's step notice reaches them.
     */
    private async markSent(
        evidence: HomeEvidence[],
        input: HomeInput,
    ): Promise<void> {
        if (evidence.length === 0 || !holds(input, "order:stage")) return;
        const orders = await this.db.order.findMany({
            where: {
                organizationId: input.organizationId,
                id: { in: evidence.map((e) => e.id) },
            },
            select: {
                id: true,
                stage: true,
                status: true,
                paymentStatus: true,
                fulfilment: true,
                customerId: true,
                customerAccountId: true,
            },
        });
        const byId = new Map(orders.map((o) => [o.id, o]));
        await Promise.all(
            evidence.map(async (ev) => {
                const order = byId.get(ev.id);
                if (!order) return;
                const stage = handoverOf(order);
                if (!stage) return;
                const notifies = orderNoticeKind(stage) !== null;
                const reach = notifies
                    ? await this.ports
                          .orderReach(input.organizationId, order)
                          .catch(() => null)
                    : "NONE";
                // Unknown: claim nothing either way, so offer nothing; the
                // row opens the order, which says it for itself.
                if (reach === null) return;
                const person = firstNameOf(ev.subtitle);
                const words = markSentWords(person, notifies, reach);
                ev.inline = {
                    kind: "MARK_SENT",
                    ...words,
                    // The stage's own Undo: within the hold while its
                    // notice waits, and on the row when nothing is sent.
                    undoable: true,
                    target: order.id,
                    person,
                    stage,
                };
            }),
        );
    }

    /**
     * Retry: the subscription's retry (`subscription:write`, and
     * `invoice:write` for the link it makes), on a renewal past its due
     * date, at a business that can take payment online.
     */
    private async retry(
        evidence: HomeEvidence[],
        input: HomeInput,
        now: Date,
    ): Promise<void> {
        if (
            evidence.length === 0 ||
            !holds(input, "subscription:write") ||
            !holds(input, "invoice:write")
        ) {
            return;
        }
        const providers = await this.db.merchantPaymentProvider.count({
            where: {
                organizationId: input.organizationId,
                status: "CONNECTED",
            },
        });
        if (providers === 0) return;
        for (const ev of evidence) {
            const via = retryVia(ev, now);
            if (!via) continue;
            const person = firstNameOf(ev.subtitle);
            ev.inline = {
                kind: "RETRY",
                ...retryWords(person),
                undoable: false,
                target: ev.id,
                person,
                via,
            };
        }
    }

    /**
     * Send reminder: D17's reminder (`invoice:write`) on the channels its
     * send flag names, once a day. With no channel, or a reminder already
     * sent today, the row stays a link to the invoice, where "Copy pay
     * link" is.
     */
    private async remind(
        evidence: HomeEvidence[],
        input: HomeInput,
        now: Date,
    ): Promise<void> {
        const sending = this.sending;
        if (!sending || evidence.length === 0) return;
        if (!holds(input, "invoice:write")) return;
        await Promise.all(
            evidence.map(async (ev) => {
                const { send } = await sending.readFor(
                    input.organizationId,
                    ev.id,
                    now,
                );
                if (send.channels.length === 0) return;
                if (send.nextReminderAt && new Date(send.nextReminderAt) > now)
                    return;
                const person = firstNameOf(ev.subtitle);
                ev.inline = {
                    kind: "SEND_REMINDER",
                    ...reminderWords(person, send.channels, send.emailTo),
                    undoable: true,
                    target: ev.id,
                    person,
                };
            }),
        );
    }

    /**
     * Reply: A13's thread (`message:write`), dark while the account area is
     * off (`SITE_ACCOUNT_AREA`), as the thread's own routes are.
     */
    private async reply(
        evidence: HomeEvidence[],
        input: HomeInput,
    ): Promise<void> {
        if (evidence.length === 0 || !accountAreaOn()) return;
        if (!holds(input, "message:write")) return;
        await Promise.all(
            evidence.map(async (ev) => {
                const signsIn = await this.ports.signsIn(
                    input.organizationId,
                    ev.id,
                );
                const person = firstNameOf(ev.subtitle);
                ev.inline = {
                    kind: "REPLY",
                    ...replyWords(person, signsIn),
                    undoable: true,
                    target: ev.id,
                    person,
                };
            }),
        );
    }
}

/** The order's handover step, when that is the step it can take next. */
export function handoverOf(order: {
    stage: string;
    status: string;
    paymentStatus: string;
    fulfilment: string;
}): OrderStage | null {
    const next = nextStages({
        stage: order.stage as OrderStage,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfilment: order.fulfilment as never,
    });
    return next.find((s) => SENT_STAGES.includes(s)) ?? null;
}

/**
 * How a renewal is retried, or null when it can't be from Home. Today only
 * a pay link, and only once the renewal is past due — the rule the
 * subscription's retry refuses by (`failedCharge`).
 *
 * The seam for D13: a subscription with an active mandate retries by
 * charging it (`MANDATE`), a renewal whose autopay failed can be retried
 * before its due date, and nothing is offered while a mandate charge is
 * PENDING (the row says "Autopay charge in progress").
 */
export function retryVia(
    ev: Pick<HomeEvidence, "at">,
    now: Date,
): HomeRetryVia | null {
    if (!ev.at) return null;
    return new Date(ev.at) < now ? "PAY_LINK" : null;
}

function defaultPorts(db: Db): InlinePorts {
    return {
        orderReach: async (organizationId, order) => {
            const contactId = await orderContactId(db, organizationId, order);
            return contactReach(db, organizationId, contactId);
        },
        signsIn: (organizationId, contactId) =>
            hasLiveAccount(db, organizationId, contactId),
    };
}
