import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fromMinor } from "../../common/money";
import {
    formatMoney,
    InvoiceSendService,
} from "../invoices/invoice-send.service";
import type { OrderStage } from "../orders/dto";
import { nextStages } from "../orders/order-stage";
import { chargesUnderWay } from "../payments/charge-under-way";
import { MandateChargesService } from "../payments/mandate-charges.service";
import { providerName } from "../payments/mandate-rules";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { MISMATCH_ATTEMPT_WHERE, owedOf } from "../payments/mismatch-refund";
import { accountAreaOn } from "../site-accounts/account-area";
import { orderContactId } from "../site-accounts/customer-notify.handler";
import type { NoticeReach } from "../site-accounts/notice-reach";
import { contactReach, hasLiveAccount } from "../site-accounts/notice-reach";
import { orderNoticeKind } from "../site-accounts/notify-templates";
import {
    firstNameOf,
    markSentWords,
    refundMismatchWords,
    reminderWords,
    replyWords,
    retryMandateWords,
    retryWords,
    reviewReplyWords,
} from "./home-inline-words";
import type {
    HomeAction,
    HomeEvidence,
    HomeInput,
    HomeRetryVia,
} from "./home-model";
import { holds } from "./home-model";
import { AUTOPAY_FAILED_TAGS, LIMIT_LOW_TAG } from "./home-money-sources";

/**
 * Needs you's inline actions (round 2, F4): which rows offer Mark sent,
 * Retry, Send reminder or Reply in place, and what each says. Read after
 * the sources and before the list is flattened, so the action rides on
 * the row's evidence into `HomeNeed.inline`. A renewal whose autopay limit
 * is too low also offers "Send a set-up link" (D14), which opens
 * Subscription Detail's own sheet (`HomeNeed.link`).
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
    /**
     * Each failed renewal's autopay (D13), by subscription: `CHARGING`, a
     * charge under way (no Retry); `MANDATE`, it can be charged again.
     * Absent (a spec's ports): pay links only, as before D13.
     */
    renewalCharges?: (
        organizationId: string,
        subscriptionIds: readonly string[],
    ) => Promise<Map<string, "CHARGING" | "MANDATE">>;
    /**
     * Whether the business offers autopay now (D14: a provider that takes
     * mandates, with its rollout flag on). Absent (a spec's ports): read
     * from the mandate set-up service, or not offered without one.
     */
    autopayOffered?: (organizationId: string) => Promise<boolean>;
}

/** The label Subscription Detail's own button has (D14). */
export const SEND_SETUP_LINK = "Send a set-up link";

@Injectable()
export class HomeInlineService {
    private readonly logger = new Logger(HomeInlineService.name);

    constructor(
        // Optional so a spec can build Home without invoices: without it
        // no row offers Send reminder.
        @Optional() private readonly sending?: InvoiceSendService,
        @Optional() private readonly db: Db = prisma,
        @Optional() private readonly ports: InlinePorts = defaultPorts(prisma),
        // Autopay's retry (D13); absent where a spec builds Home by hand.
        @Optional() private readonly charges?: MandateChargesService,
        // Whether autopay is offered, for "Send a set-up link" (D14).
        @Optional() private readonly setups?: MandateSetupService,
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
            this.step(SEND_SETUP_LINK, () =>
                this.setUpLink(of("PAYMENTS_FAILED_RENEWALS"), input),
            ),
            this.step("Send reminder", () =>
                this.remind(of("PAYMENTS_OVERDUE_INVOICES"), input, now),
            ),
            this.step("Reply", () =>
                this.reply(of("CRM_UNANSWERED_MESSAGES"), input),
            ),
            this.step("Refund", () =>
                this.refundMismatch(of("PAYMENTS_REFUNDS_OWED"), input),
            ),
            this.step("Reply to review", () => {
                reviewReplyOn(of("COMMERCE_LOW_STAR_REVIEWS"), input);
                return Promise.resolve();
            }),
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
                payOnHandover: true,
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
     * Retry: the subscription's retry (`subscription:write`), at a business
     * that can take payment online. By autopay when the renewal's mandate
     * can take it (D13), else by a pay link, which needs `invoice:write`
     * too; on a renewal past its due date, or whose autopay failed. None
     * while an autopay charge is under way: the row says so instead.
     */
    private async retry(
        evidence: HomeEvidence[],
        input: HomeInput,
        now: Date,
    ): Promise<void> {
        if (evidence.length === 0 || !holds(input, "subscription:write")) {
            return;
        }
        const providers = await this.db.merchantPaymentProvider.count({
            where: {
                organizationId: input.organizationId,
                status: "CONNECTED",
            },
        });
        if (providers === 0) return;
        const read = this.ports.renewalCharges ?? this.renewalCharges();
        const charges = read
            ? await read(
                  input.organizationId,
                  evidence.map((ev) => ev.id),
              )
            : new Map<string, "CHARGING" | "MANDATE">();
        const canLink = holds(input, "invoice:write");
        for (const ev of evidence) {
            const charge = charges.get(ev.id);
            if (charge === "CHARGING") continue;
            const via = retryVia(ev, now, {
                mandate: charge === "MANDATE",
                payLink: canLink,
            });
            if (!via) continue;
            const person = firstNameOf(ev.subtitle);
            ev.inline = {
                kind: "RETRY",
                ...(via === "MANDATE"
                    ? retryMandateWords(person)
                    : retryWords(person)),
                undoable: false,
                target: ev.id,
                person,
                via,
            };
        }
    }

    /**
     * "Send a set-up link" (D14) on a renewal above its autopay's limit
     * (D13's "Autopay limit too low"), beside its Retry: the customer
     * authorises again for a limit that covers it. It opens Subscription
     * Detail's own sheet, where the method is picked and the link is shown
     * once, so Home adds no write. Offered to `subscription:write` (the
     * set-up link's own gate) while the business offers autopay; not while
     * a charge is under way, since that row's tag says so instead.
     */
    private async setUpLink(
        evidence: HomeEvidence[],
        input: HomeInput,
    ): Promise<void> {
        const low = evidence.filter((ev) => ev.tag === LIMIT_LOW_TAG);
        if (low.length === 0 || !holds(input, "subscription:write")) return;
        const offered = this.ports.autopayOffered ?? this.autopayOffered();
        if (!offered || !(await offered(input.organizationId))) return;
        for (const ev of low) {
            ev.link = {
                label: SEND_SETUP_LINK,
                href: `/billing/subscriptions/${encodeURIComponent(ev.id)}?do=autopay-link`,
            };
        }
    }

    /** The production read behind `autopayOffered`, when set-up is wired. */
    private autopayOffered(): InlinePorts["autopayOffered"] {
        const setups = this.setups;
        if (!setups) return undefined;
        return async (organizationId) =>
            (await setups.mandateMethods(organizationId)).some(
                (o) => o.methods.length > 0,
            );
    }

    /** The production read behind `renewalCharges`, when autopay is wired. */
    private renewalCharges(): InlinePorts["renewalCharges"] {
        const charges = this.charges;
        if (!charges) return undefined;
        return async (organizationId, subscriptionIds) => {
            const states = new Map<string, "CHARGING" | "MANDATE">();
            const invoices = await this.db.invoice.findMany({
                where: {
                    organizationId,
                    subscriptionId: { in: [...subscriptionIds] },
                    status: "ISSUED",
                },
                select: { id: true, subscriptionId: true },
            });
            const underWay = await chargesUnderWay(
                this.db,
                organizationId,
                invoices.map((i) => i.id),
            );
            for (const inv of invoices) {
                if (inv.subscriptionId && underWay.has(inv.id)) {
                    states.set(inv.subscriptionId, "CHARGING");
                }
            }
            const open = subscriptionIds.filter((id) => !states.has(id));
            for (const id of await charges.mandateRetryable(
                organizationId,
                open,
            )) {
                states.set(id, "MANDATE");
            }
            return states;
        };
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
     * Refund (PAY-06): on a capture taken at a different amount than asked,
     * exactly what it captured goes back (`payment-attempts/:id/refund`).
     * `order:refund`, the refund permission; only while the provider it was
     * paid through is connected, since the refund is sent through it, and
     * only when the capture recorded its amount. Other refunds owed stay
     * links to their invoice.
     */
    private async refundMismatch(
        evidence: HomeEvidence[],
        input: HomeInput,
    ): Promise<void> {
        if (evidence.length === 0 || !holds(input, "order:refund")) return;
        const attempts = await this.db.paymentAttempt.findMany({
            where: {
                organizationId: input.organizationId,
                id: { in: evidence.map((ev) => ev.id) },
                ...MISMATCH_ATTEMPT_WHERE,
            },
            select: {
                id: true,
                rawResponse: true,
                paymentIntent: {
                    select: {
                        provider: true,
                        currency: true,
                        orderId: true,
                        invoiceId: true,
                    },
                },
            },
        });
        if (attempts.length === 0) return;
        const connected = await this.db.merchantPaymentProvider.findMany({
            where: {
                organizationId: input.organizationId,
                status: "CONNECTED",
            },
            select: { provider: true },
        });
        const live = new Set(connected.map((c) => c.provider));
        const byId = new Map(attempts.map((a) => [a.id, a]));
        for (const ev of evidence) {
            const attempt = byId.get(ev.id);
            if (!attempt) continue;
            const intent = attempt.paymentIntent;
            if (!live.has(intent.provider)) continue;
            const owed = owedOf(attempt.rawResponse, intent.currency);
            if (!owed) continue;
            // The row's line is "Name · what happened", or only the latter.
            const person = ev.subtitle?.includes(" · ")
                ? firstNameOf(ev.subtitle.split(" · ")[0])
                : null;
            ev.inline = {
                kind: "REFUND",
                ...refundMismatchWords(
                    person,
                    formatMoney(fromMinor(owed.amountCents), owed.currency),
                    providerName(intent.provider),
                    intent.orderId
                        ? "order"
                        : intent.invoiceId
                          ? "invoice"
                          : null,
                ),
                undoable: false,
                target: attempt.id,
                person,
            };
        }
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

/**
 * Reply to a low-star review (F2): `product-review:write`, the reply
 * endpoint's own permission. Every row on that list is a published review
 * with no reply yet, so each can take one; no read of its own.
 */
export function reviewReplyOn(
    evidence: HomeEvidence[],
    input: HomeInput,
): void {
    if (!holds(input, "product-review:write")) return;
    for (const ev of evidence) {
        const person = firstNameOf(ev.subtitle);
        ev.inline = {
            kind: "REVIEW_REPLY",
            ...reviewReplyWords(person),
            undoable: true,
            target: ev.id,
            person,
        };
    }
}

/** The order's handover step, when that is the step it can take next. */
export function handoverOf(order: {
    stage: string;
    status: string;
    paymentStatus: string;
    fulfilment: string;
    payOnHandover?: boolean;
}): OrderStage | null {
    const next = nextStages({
        stage: order.stage as OrderStage,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfilment: order.fulfilment as never,
        payOnHandover: order.payOnHandover,
    });
    return next.find((s) => SENT_STAGES.includes(s)) ?? null;
}

/**
 * How a renewal is retried, or null when it can't be from Home — the rule
 * the subscription's retry refuses by (`failedCharge`): once the renewal
 * is past due, or its autopay failed (D13: "Payment failed", "Autopay
 * limit too low"). By autopay (`MANDATE`) when its mandate can take it,
 * else by a pay link when the viewer may make one. A charge under way is
 * left out before this is asked (the row says "Autopay charge in
 * progress").
 */
export function retryVia(
    ev: Pick<HomeEvidence, "at" | "tag">,
    now: Date,
    can: { mandate?: boolean; payLink?: boolean } = { payLink: true },
): HomeRetryVia | null {
    const autopayFailed =
        ev.tag !== undefined && AUTOPAY_FAILED_TAGS.includes(ev.tag);
    const due = ev.at !== null && new Date(ev.at) < now;
    if (!due && !autopayFailed) return null;
    if (can.mandate) return "MANDATE";
    return can.payLink ? "PAY_LINK" : null;
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
