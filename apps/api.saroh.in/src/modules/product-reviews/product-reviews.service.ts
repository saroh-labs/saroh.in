import {
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma, ProductReview } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { planMeter } from "../billing/metering.service";
import { CommunicationsService } from "../communications/communications.service";
import { CANCELLED_DELIVERY } from "../communications/message-send.handler";
import { renderReviewInvitation } from "../communications/transactional";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { PRODUCT_LINES } from "../orders/order-line";
import { rendererBase } from "../sites/site-origin";
import { contactReviewsWhere } from "./contact-reviews";
import type { IneligibleReason } from "./eligibility";
import { INELIGIBLE_MESSAGE, orderIneligibility } from "./eligibility";
import { MAX_REVIEW_SENDS, mintReviewToken, REVIEW_LINK_DAYS } from "./token";

/** The type a review's workspace notice carries (U10). */
export const REVIEW_NOTICE_TYPE = "review.needs-reply";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back "Invite a review" looks for orders nobody was asked about. */
const INVITABLE_WINDOW_DAYS = 90;
/**
 * Invitations per business per day. They go through the business's own
 * provider now (D11), but an order's customer email is still whatever was
 * typed onto the order, so a cap keeps a bulk invite from becoming a mailer.
 */
const DAILY_INVITES = 200;

export interface ReviewView {
    id: string;
    rating: number;
    body: string | null;
    displayName: string;
    productId: string | null;
    productName: string;
    storeId: string;
    invitedTo: string;
    status: "PUBLISHED" | "HIDDEN";
    reply: string | null;
    repliedAt: string | null;
    createdAt: string;
}

export interface ProductRating {
    productId: string;
    /** Published reviews only, to one decimal. */
    average: number;
    count: number;
}

export interface InvitableOrder {
    id: string;
    orderNumber: string;
    storeId: string;
    storeName: string;
    customerName: string | null;
    customerEmail: string;
    placedAt: string;
    itemCount: number;
}

/**
 * Whether the business can send review invitations (D11): only through its
 * own connected email provider. `canConnect` says, when it has none,
 * whether its plan lets it connect one (the connect's own check,
 * `MeteringService.hasRoom` on `integrations`, DEC-091); null when it has
 * one, or when the plan couldn't be read.
 */
export interface ReviewEmailSetup {
    connected: boolean;
    canConnect: boolean | null;
}

/** What a delivery of the invitation's latest message says about it. */
const ACCEPTED_DELIVERY = ["SENT", "DELIVERED"];
/** Undelivered sends a resend withdraws: still queued, or failed and retrying. */
const WITHDRAWABLE_DELIVERY = ["QUEUED", "FAILED"];

export type InviteSkip =
    | IneligibleReason
    | "not-found"
    | "completed"
    | "sending"
    | "send-limit"
    | "unsubscribed"
    | "no-email-provider"
    | "daily-limit";

export type InviteResult =
    | {
          orderId: string;
          /**
           * Queued through the business's own email provider; it shows as
           * sent, and counts as a send, once the provider accepts it.
           */
          status: "queued";
          /** No contact linked or matched, so consent could not be checked. */
          note?: "consent-not-checked";
      }
    | {
          orderId: string;
          status: "skipped";
          reason: InviteSkip;
          message: string;
      };

export interface InvitationState {
    /**
     * sending: queued, the provider hasn't taken it yet. failed: the latest
     * send didn't go (it used none of the three). sent: the provider
     * accepted it.
     */
    state: "none" | "sending" | "failed" | "sent" | "completed" | "expired";
    /** When the latest send was queued. */
    sentAt: string | null;
    /** Sends the provider accepted (and, before D11, Saroh's sends). */
    sendCount: number;
    reviewed: number;
    lines: number;
    /** Null when the order can be invited (or re-sent); else why not. */
    blocked: { reason: InviteSkip; message: string } | null;
    /** Whether invitations can go at all, for the section to lead with. */
    email: ReviewEmailSetup;
}

export const NO_PROVIDER_MESSAGE =
    "Review invitations go from your own email. Connect an email provider in Settings › Providers to send them.";
export const NO_PROVIDER_PLAN_MESSAGE =
    "Review invitations go from your own email, and connecting your own email needs a paid plan.";

const SKIP_MESSAGE: Record<Exclude<InviteSkip, IneligibleReason>, string> = {
    "not-found": "This order was not found.",
    completed: "Every item on this order has been reviewed.",
    sending:
        "The invitation is still being sent. It shows as sent once your email provider accepts it.",
    "send-limit": "This order has already been asked three times.",
    unsubscribed: "This customer has unsubscribed from email.",
    "no-email-provider": NO_PROVIDER_MESSAGE,
    "daily-limit": "Today's invitations are used up. Try again tomorrow.",
};

/**
 * The words for "no email provider", by whether the plan lets the business
 * connect one. The app shows the same words, with the way to fix it.
 */
export function noProviderMessage(canConnect: boolean | null): string {
    return canConnect === false
        ? NO_PROVIDER_PLAN_MESSAGE
        : NO_PROVIDER_MESSAGE;
}

const skipMessage = (
    reason: InviteSkip,
    canConnect: boolean | null = null,
): string =>
    reason === "no-email-provider"
        ? noProviderMessage(canConnect)
        : reason in INELIGIBLE_MESSAGE
          ? INELIGIBLE_MESSAGE[reason as IneligibleReason]
          : SKIP_MESSAGE[reason as Exclude<InviteSkip, IneligibleReason>];

function toView(r: ProductReview): ReviewView {
    return {
        id: r.id,
        rating: r.rating,
        body: r.body,
        displayName: r.displayName,
        productId: r.productId,
        productName: r.productName,
        storeId: r.storeId,
        invitedTo: r.invitedTo,
        status: r.status === "HIDDEN" ? "HIDDEN" : "PUBLISHED",
        reply: r.reply,
        repliedAt: r.repliedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
    };
}

function reviewLink(token: string): string {
    return `${rendererBase()}/review/${token}`;
}

/**
 * Product reviews, as the business sees them (plan 2026-09-21-001).
 *
 * Every read and write is scoped by the organization from the request
 * context; another business's review or order is a 404. Invitations are the
 * only way a review can begin: one per order, sent only for an order that was
 * paid and shipped, through the business's own email provider (DEC-011,
 * MARKETING_CLAIMS D11); with none connected, nothing is sent.
 */
@Injectable()
export class ProductReviewsService {
    constructor(
        private readonly comms: CommunicationsService,
        @Optional() private readonly audit?: AuditService,
        @Optional()
        private readonly dailyLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            DAILY_INVITES,
            DAY_MS,
        ),
    ) {}

    /**
     * Whether the plan has room for the business's own email (DEC-091):
     * the connect's own check. A property so a test can stand in for it.
     */
    ownEmailRoom = (organizationId: string): Promise<boolean> =>
        planMeter.hasRoom(organizationId, "integrations");

    /** Whether invitations can go, and if not, whether the plan can fix it. */
    async emailSetup(organizationId: string): Promise<ReviewEmailSetup> {
        if (await this.comms.emailConnected(prisma, organizationId)) {
            return { connected: true, canConnect: null };
        }
        const canConnect = await this.ownEmailRoom(organizationId).catch(
            () => null,
        );
        return { connected: false, canConnect };
    }

    async list(
        organizationId: string,
        filter: {
            productId?: string;
            status?: string;
            contactId?: string;
        } = {},
    ): Promise<ReviewView[]> {
        // One customer's reviews (C6): through their confirmed links only.
        const byContact = filter.contactId
            ? await contactReviewsWhere(organizationId, filter.contactId)
            : undefined;
        if (byContact === null) return [];
        const rows = await prisma.productReview.findMany({
            where: {
                organizationId,
                ...byContact,
                ...(filter.productId ? { productId: filter.productId } : {}),
                ...(filter.status === "PUBLISHED" || filter.status === "HIDDEN"
                    ? { status: filter.status }
                    : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 500,
        });
        return rows.map(toView);
    }

    /** The published average per product. A hidden review counts nowhere. */
    async summary(organizationId: string): Promise<ProductRating[]> {
        const groups = await prisma.productReview.groupBy({
            by: ["productId"],
            where: {
                organizationId,
                status: "PUBLISHED",
                productId: { not: null },
            },
            _avg: { rating: true },
            _count: { _all: true },
        });
        return groups.flatMap((g) =>
            g.productId
                ? [
                      {
                          productId: g.productId,
                          average: Math.round((g._avg.rating ?? 0) * 10) / 10,
                          count: g._count._all,
                      },
                  ]
                : [],
        );
    }

    /**
     * Paid, shipped orders from the last 90 days nobody has been asked about:
     * no invitation, or one whose every send failed (none accepted, none
     * still on its way) and that Saroh's sender never sent.
     */
    async invitableOrders(organizationId: string): Promise<InvitableOrder[]> {
        const orders = await prisma.order.findMany({
            where: {
                organizationId,
                paymentStatus: "PAID",
                status: { in: ["SHIPPED", "DELIVERED"] },
                OR: [
                    { reviewInvitation: null },
                    {
                        reviewInvitation: {
                            completedAt: null,
                            sendCount: 0,
                            messages: {
                                none: {
                                    deliveries: {
                                        some: {
                                            status: {
                                                in: [
                                                    ...ACCEPTED_DELIVERY,
                                                    "QUEUED",
                                                ],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                ],
                createdAt: {
                    gte: new Date(Date.now() - INVITABLE_WINDOW_DAYS * DAY_MS),
                },
                // A treatment's order (E9) has no product to review.
                items: { some: PRODUCT_LINES },
                // A walk-in (B13) left no email: nobody to invite.
                customerId: { not: null },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: {
                id: true,
                orderId: true,
                storeId: true,
                createdAt: true,
                store: { select: { name: true } },
                customer: {
                    select: { email: true, firstName: true, lastName: true },
                },
                _count: { select: { items: { where: PRODUCT_LINES } } },
            },
        });
        return orders.flatMap((o) => {
            const customer = o.customer;
            // No email, or a placeholder (a walk-in kept by phone, B13b).
            if (!customer || !contactEmailForDisplay(customer.email)) {
                return [];
            }
            return [
                {
                    id: o.id,
                    orderNumber: o.orderId,
                    storeId: o.storeId,
                    storeName: o.store.name,
                    customerName:
                        [customer.firstName, customer.lastName]
                            .filter(Boolean)
                            .join(" ") || null,
                    customerEmail: customer.email,
                    placedAt: o.createdAt.toISOString(),
                    itemCount: o._count.items,
                },
            ];
        });
    }

    /** Where one order's invitation stands — the order page's Reviews section. */
    async invitationState(
        organizationId: string,
        orderId: string,
    ): Promise<InvitationState> {
        const order = await this.loadOrder(organizationId, orderId);
        if (!order) throw new NotFoundException("Order not found");
        const inv = order.reviewInvitation;
        const reviewed = inv?._count.reviews ?? 0;
        const lines = order._count.items;
        const send = inv ? sendStatus(inv) : "sent";
        const state: InvitationState["state"] = !inv
            ? "none"
            : inv.completedAt
              ? "completed"
              : send !== "sent"
                ? send
                : inv.expiresAt < new Date()
                  ? "expired"
                  : "sent";
        const email = await this.emailSetup(organizationId);
        const reason =
            this.blockedReason(order) ??
            (email.connected ? null : "no-email-provider");
        return {
            state,
            sentAt: inv?.lastSentAt.toISOString() ?? null,
            sendCount: inv ? sendsUsed(inv) : 0,
            reviewed,
            lines,
            blocked: reason
                ? { reason, message: skipMessage(reason, email.canConnect) }
                : null,
            email,
        };
    }

    /**
     * Ask the customers of these orders for reviews. Per order: eligible, not
     * finished, not still being sent, under the send limit, the business's
     * email provider connected, not unsubscribed — then the email is queued
     * through that provider and the invitation written in the same
     * transaction.
     *
     * One order has one live link: a resend rotates the token in place, so
     * the old link stops working, and withdraws the earlier sends that
     * haven't gone (a failed one may still be retrying) so none goes out
     * with a dead link. A send still queued blocks a resend ("sending").
     */
    async invite(
        ctx: OrganizationContext,
        orderIds: string[],
    ): Promise<InviteResult[]> {
        const results: InviteResult[] = [];
        for (const orderId of [...new Set(orderIds)]) {
            results.push(await this.inviteOne(ctx, orderId));
        }
        return results;
    }

    private async inviteOne(
        ctx: OrganizationContext,
        orderId: string,
    ): Promise<InviteResult> {
        const skip = (reason: InviteSkip): InviteResult => ({
            orderId,
            status: "skipped",
            reason,
            message: skipMessage(reason),
        });
        const order = await this.loadOrder(ctx.organizationId, orderId);
        if (!order) return skip("not-found");
        const blocked = this.blockedReason(order);
        if (blocked) return skip(blocked);
        const noProvider = async (): Promise<InviteResult> => {
            const { canConnect } = await this.emailSetup(ctx.organizationId);
            return {
                orderId,
                status: "skipped",
                reason: "no-email-provider",
                message: noProviderMessage(canConnect),
            };
        };

        // A walk-in (B13) has no customer and no email: never invited.
        const email =
            contactEmailForDisplay(order.customer?.email)?.trim() ?? "";
        if (!email || !order.customerId) return skip("no-email");
        if (!(await this.comms.emailConnected(prisma, ctx.organizationId))) {
            return noProvider();
        }
        const consent = await this.consentFor(
            ctx.organizationId,
            order.customerId,
            email,
        );
        if (consent === "revoked") return skip("unsubscribed");

        if (!this.dailyLimiter.take(ctx.organizationId)) {
            return skip("daily-limit");
        }

        const { token, tokenHash } = mintReviewToken();
        const outcome = await prisma
            .$transaction(async (tx) => {
                const queued = await this.comms.queueTransactional(
                    tx,
                    ctx.organizationId,
                    {
                        template: "REVIEW_INVITATION",
                        rendered: renderReviewInvitation({
                            store: order.store.name,
                            days: REVIEW_LINK_DAYS,
                        }),
                        recipient: { kind: "ORDER_CUSTOMER", orderId },
                        // The review link is a secret link, like a pay
                        // link: sealed into the send job, never stored.
                        secretLink: () => Promise.resolve(reviewLink(token)),
                        createdByUserId: ctx.userId,
                    },
                );
                // The send path's own consent gate (the linked contact).
                if (queued.status === "SUPPRESSED") return "unsubscribed";

                // Written once the email is QUEUED, in the same transaction
                // (it used to be written only once Saroh's sender said it had
                // left). It shows as sent, and counts as a send, only once
                // the provider accepts it (its Message's delivery).
                const expiresAt = new Date(
                    Date.now() + REVIEW_LINK_DAYS * DAY_MS,
                );
                const now = new Date();
                const inv = await tx.reviewInvitation.upsert({
                    where: { orderId },
                    create: {
                        organizationId: ctx.organizationId,
                        orderId,
                        tokenHash,
                        toAddress: queued.toAddress,
                        expiresAt,
                        lastSentAt: now,
                        // Saroh's sends only; provider sends are counted
                        // from their deliveries.
                        sendCount: 0,
                        createdByUserId: ctx.userId,
                    },
                    update: {
                        tokenHash,
                        toAddress: queued.toAddress,
                        expiresAt,
                        lastSentAt: now,
                    },
                    select: { id: true },
                });
                // The earlier link is dead now: withdraw its sends that
                // haven't gone, so the job never sends them.
                await tx.delivery.updateMany({
                    where: {
                        message: { reviewInvitationId: inv.id },
                        status: { in: WITHDRAWABLE_DELIVERY },
                    },
                    data: { status: CANCELLED_DELIVERY },
                });
                await tx.message.updateMany({
                    where: {
                        reviewInvitationId: inv.id,
                        status: { in: WITHDRAWABLE_DELIVERY },
                        // Never one its provider already took.
                        deliveries: {
                            none: { status: { in: ACCEPTED_DELIVERY } },
                        },
                    },
                    data: { status: CANCELLED_DELIVERY },
                });
                await tx.message.update({
                    where: { id: queued.id },
                    data: { reviewInvitationId: inv.id },
                });
                return "queued" as const;
            })
            .catch((err: unknown) => {
                // No address the send path accepts, or the provider went
                // between the check and the send.
                if (err instanceof ConflictException) return "conflict";
                throw err;
            });
        if (outcome === "unsubscribed") return skip("unsubscribed");
        if (outcome === "conflict") {
            return (await this.comms.emailConnected(prisma, ctx.organizationId))
                ? skip("no-email")
                : noProvider();
        }

        await this.audit?.record({
            action: AuditAction.ProductReviewInvite,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "order",
            targetId: orderId,
            outcome: AuditOutcome.Success,
        });
        return consent === "unknown"
            ? { orderId, status: "queued", note: "consent-not-checked" }
            : { orderId, status: "queued" };
    }

    async reply(
        ctx: OrganizationContext,
        reviewId: string,
        reply: string,
    ): Promise<ReviewView> {
        const review = await this.requireReview(ctx.organizationId, reviewId);
        const now = new Date();
        await prisma.productReview.update({
            where: { id: review.id },
            data: {
                reply,
                ...(review.repliedAt
                    ? { replyUpdatedAt: now }
                    : { repliedAt: now }),
            },
        });
        await this.settle(ctx, reviewId, AuditAction.ProductReviewReply);
        return this.one(ctx.organizationId, reviewId);
    }

    async setHidden(
        ctx: OrganizationContext,
        reviewId: string,
        hidden: boolean,
    ): Promise<ReviewView> {
        await this.requireReview(ctx.organizationId, reviewId);
        await prisma.productReview.update({
            where: { id: reviewId },
            data: hidden
                ? {
                      status: "HIDDEN",
                      hiddenAt: new Date(),
                      hiddenByUserId: ctx.userId,
                  }
                : { status: "PUBLISHED", hiddenAt: null, hiddenByUserId: null },
        });
        await this.settle(
            ctx,
            reviewId,
            hidden
                ? AuditAction.ProductReviewHide
                : AuditAction.ProductReviewUnhide,
            hidden,
        );
        return this.one(ctx.organizationId, reviewId);
    }

    /**
     * After a merchant acts on a review: its "needs a reply" notice is done
     * (reply or hide clears it; unhide does not re-raise it), and the act is
     * audited.
     */
    private async settle(
        ctx: OrganizationContext,
        reviewId: string,
        action: AuditAction,
        clearsNotice = true,
    ): Promise<void> {
        if (clearsNotice) {
            await prisma.notification.updateMany({
                where: {
                    organizationId: ctx.organizationId,
                    reviewId,
                    type: REVIEW_NOTICE_TYPE,
                    readAt: null,
                },
                data: { readAt: new Date() },
            });
        }
        await this.audit?.record({
            action,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "product-review",
            targetId: reviewId,
            outcome: AuditOutcome.Success,
        });
    }

    private async one(organizationId: string, id: string): Promise<ReviewView> {
        const row = await prisma.productReview.findFirst({
            where: { id, organizationId },
        });
        if (!row) throw new NotFoundException("Review not found");
        return toView(row);
    }

    private async requireReview(organizationId: string, id: string) {
        const review = await prisma.productReview.findFirst({
            where: { id, organizationId },
            select: { id: true, repliedAt: true },
        });
        if (!review) throw new NotFoundException("Review not found");
        return review;
    }

    private loadOrder(organizationId: string, orderId: string) {
        return prisma.order.findFirst({
            where: { id: orderId, organizationId },
            select: {
                id: true,
                organizationId: true,
                status: true,
                paymentStatus: true,
                customerId: true,
                store: { select: { name: true } },
                customer: { select: { email: true } },
                _count: { select: { items: { where: PRODUCT_LINES } } },
                reviewInvitation: { select: INVITATION_SELECT },
            },
        });
    }

    private blockedReason(
        order: NonNullable<
            Awaited<ReturnType<ProductReviewsService["loadOrder"]>>
        >,
    ): InviteSkip | null {
        const ineligible = orderIneligibility({
            organizationId: order.organizationId,
            status: order.status,
            paymentStatus: order.paymentStatus,
            customerEmail: order.customer?.email ?? null,
            productLines: order._count.items,
        });
        if (ineligible) return ineligible;
        if (order.reviewInvitation?.completedAt) return "completed";
        const inv = order.reviewInvitation;
        if (inv && sendStatus(inv) === "sending") return "sending";
        if (inv && sendsUsed(inv) >= MAX_REVIEW_SENDS) return "send-limit";
        return null;
    }

    /**
     * Consent, the long way round: the communications gate only runs for a
     * contact id, and an order has a Customer. So look up every contact linked
     * to this customer or holding this email in the business, and refuse if
     * any has revoked email. No contact at all: allowed, and said so.
     */
    private async consentFor(
        organizationId: string,
        customerId: string,
        email: string,
    ): Promise<"revoked" | "ok" | "unknown"> {
        const [linked, sameEmail] = await Promise.all([
            prisma.customerIdentityLink.findMany({
                where: { organizationId, customerId },
                select: { contactId: true },
            }),
            prisma.contact.findMany({
                where: {
                    organizationId,
                    email: { equals: email, mode: "insensitive" },
                },
                select: { id: true },
            }),
        ]);
        const contactIds = [
            ...new Set([
                ...linked.map((l) => l.contactId),
                ...sameEmail.map((c) => c.id),
            ]),
        ];
        if (contactIds.length === 0) return "unknown";
        const revoked = await prisma.consent.findFirst({
            where: {
                organizationId,
                contactId: { in: contactIds },
                channel: "EMAIL",
                status: "REVOKED",
            },
            select: { id: true },
        });
        return revoked ? "revoked" : "ok";
    }
}

/**
 * What an order's invitation is read with: its latest message's latest
 * delivery, and how many of its messages the provider accepted.
 */
const INVITATION_SELECT = {
    completedAt: true,
    expiresAt: true,
    lastSentAt: true,
    sendCount: true,
    messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
            status: true,
            deliveries: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true },
            },
        },
    },
    _count: {
        select: {
            reviews: true,
            messages: {
                where: {
                    deliveries: { some: { status: { in: ACCEPTED_DELIVERY } } },
                },
            },
        },
    },
} as const satisfies Prisma.ReviewInvitationSelect;

type InvitationRow = Prisma.ReviewInvitationGetPayload<{
    select: typeof INVITATION_SELECT;
}>;

/**
 * Where the latest send stands: its message's latest delivery. Accepted
 * (SENT, DELIVERED): sent. Still QUEUED: sending. Anything else (failed,
 * bounced): failed. No message at all is an invitation Saroh's sender sent
 * before D11, recorded only once it had left: sent.
 */
export function sendStatus(
    inv: Pick<InvitationRow, "messages">,
): "sending" | "sent" | "failed" {
    if (inv.messages.length === 0) return "sent";
    const latest = inv.messages[0];
    const status =
        latest.deliveries.length > 0
            ? latest.deliveries[0].status
            : latest.status;
    if (ACCEPTED_DELIVERY.includes(status)) return "sent";
    if (status === "QUEUED") return "sending";
    return "failed";
}

/** Sends used of the three: Saroh's (before D11) and the provider's accepted. */
export function sendsUsed(
    inv: Pick<InvitationRow, "sendCount" | "_count">,
): number {
    return inv.sendCount + inv._count.messages;
}

/** A 429 for the public path, shared so both services say it the same way. */
export function tooManyRequests(message: string): HttpException {
    return new HttpException(message, 429);
}
