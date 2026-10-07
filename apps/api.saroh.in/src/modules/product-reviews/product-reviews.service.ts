import {
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { ProductReview } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { CommunicationsService } from "../communications/communications.service";
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

export type InviteSkip =
    | IneligibleReason
    | "not-found"
    | "completed"
    | "send-limit"
    | "unsubscribed"
    | "no-email-provider"
    | "daily-limit";

export type InviteResult =
    | {
          orderId: string;
          /**
           * Queued through the business's own email provider; the send job
           * hands it over (and retries) from there.
           */
          status: "sent";
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
    state: "none" | "sent" | "completed" | "expired";
    sentAt: string | null;
    sendCount: number;
    reviewed: number;
    lines: number;
    /** Null when the order can be invited (or re-sent); else why not. */
    blocked: { reason: InviteSkip; message: string } | null;
}

const SKIP_MESSAGE: Record<Exclude<InviteSkip, IneligibleReason>, string> = {
    "not-found": "This order was not found.",
    completed: "Every item on this order has been reviewed.",
    "send-limit": "This order has already been asked three times.",
    unsubscribed: "This customer has unsubscribed from email.",
    "no-email-provider":
        "Review invitations go from your own email. Connect an email provider in Settings › Providers to send them.",
    "daily-limit": "Today's invitations are used up. Try again tomorrow.",
};

const skipMessage = (reason: InviteSkip): string =>
    reason in INELIGIBLE_MESSAGE
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

    /** Paid, shipped orders from the last 90 days nobody has been asked about. */
    async invitableOrders(organizationId: string): Promise<InvitableOrder[]> {
        const orders = await prisma.order.findMany({
            where: {
                organizationId,
                paymentStatus: "PAID",
                status: { in: ["SHIPPED", "DELIVERED"] },
                reviewInvitation: null,
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
        const state: InvitationState["state"] = !inv
            ? "none"
            : inv.completedAt
              ? "completed"
              : inv.expiresAt < new Date()
                ? "expired"
                : "sent";
        const reason =
            this.blockedReason(order) ??
            ((await this.comms.emailConnected(prisma, organizationId))
                ? null
                : "no-email-provider");
        return {
            state,
            sentAt: inv?.lastSentAt.toISOString() ?? null,
            sendCount: inv?.sendCount ?? 0,
            reviewed,
            lines,
            blocked: reason ? { reason, message: skipMessage(reason) } : null,
        };
    }

    /**
     * Ask the customers of these orders for reviews. Per order: eligible, not
     * finished, under the send limit, the business's email provider
     * connected, not unsubscribed — then the email is queued through that
     * provider and the invitation written in the same transaction (a resend
     * rotates the token in place, so the old link stops working).
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

        // A walk-in (B13) has no customer and no email: never invited.
        const email =
            contactEmailForDisplay(order.customer?.email)?.trim() ?? "";
        if (!email || !order.customerId) return skip("no-email");
        if (!(await this.comms.emailConnected(prisma, ctx.organizationId))) {
            return skip("no-email-provider");
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
                // left). The business's provider sends it from the job, which
                // retries; the token in the job is the one hashed here.
                const expiresAt = new Date(
                    Date.now() + REVIEW_LINK_DAYS * DAY_MS,
                );
                const now = new Date();
                await tx.reviewInvitation.upsert({
                    where: { orderId },
                    create: {
                        organizationId: ctx.organizationId,
                        orderId,
                        tokenHash,
                        toAddress: queued.toAddress,
                        expiresAt,
                        lastSentAt: now,
                        createdByUserId: ctx.userId,
                    },
                    update: {
                        tokenHash,
                        toAddress: queued.toAddress,
                        expiresAt,
                        lastSentAt: now,
                        sendCount: { increment: 1 },
                    },
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
            return skip(
                (await this.comms.emailConnected(prisma, ctx.organizationId))
                    ? "no-email"
                    : "no-email-provider",
            );
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
            ? { orderId, status: "sent", note: "consent-not-checked" }
            : { orderId, status: "sent" };
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
                reviewInvitation: {
                    select: {
                        completedAt: true,
                        expiresAt: true,
                        lastSentAt: true,
                        sendCount: true,
                        _count: { select: { reviews: true } },
                    },
                },
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
        if ((order.reviewInvitation?.sendCount ?? 0) >= MAX_REVIEW_SENDS) {
            return "send-limit";
        }
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

/** A 429 for the public path, shared so both services say it the same way. */
export function tooManyRequests(message: string): HttpException {
    return new HttpException(message, 429);
}
