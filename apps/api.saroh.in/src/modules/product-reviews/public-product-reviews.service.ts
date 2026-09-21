import {
    ConflictException,
    GoneException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { Prisma, prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { parseSiteStyle, siteStyleVariables } from "../sites/site-style";
import type { PublicReviewDto } from "./dto";
import { orderIneligibility } from "./eligibility";
import { REVIEW_NOTICE_TYPE, tooManyRequests } from "./product-reviews.service";
import { hashReviewToken } from "./token";

/** Why a link no longer takes reviews — the page picks its sentence by it. */
export type GoneReason = "expired" | "completed" | "not-eligible";

export interface PublicReviewLine {
    orderItemId: string;
    productName: string;
    image: string | null;
    reviewed: boolean;
}

/**
 * What the review page needs, and nothing more (R9): no email, prices,
 * totals, order number or customer id.
 */
export interface PublicReviewInvitation {
    storeName: string;
    /** The business's site theme, as `--site-*` variables; null for defaults. */
    theme: Record<string, string> | null;
    suggestedName: string;
    lines: PublicReviewLine[];
}

/** Posts per invitation per window: a known link can't be flooded. */
const POSTS_PER_WINDOW = 10;
const POST_WINDOW_MS = 10 * 60 * 1000;

/**
 * Control and bidi-override characters never belong in a review: the first
 * can break what renders it, the second can make text read differently from
 * what it says. Tab and newline are kept — a review may have paragraphs.
 */
function isUnsafe(code: number): boolean {
    return (
        (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
        code === 0x7f ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
    );
}

const clean = (s: string) =>
    Array.from(s)
        .filter((c) => !isUnsafe(c.codePointAt(0) ?? 0))
        .join("")
        .trim();

function gone(reason: GoneReason, message: string): GoneException {
    return new GoneException({ message, details: { reason } });
}

/**
 * The customer's side of a review invitation — no session, so everything
 * hangs on the token.
 *
 * The token is found by its hash and NOTHING else is taken from the request:
 * the business, order, product and customer all come from the invitation's
 * own rows, and the body names only an order line, which must belong to the
 * invitation's order. The hash lookup runs before any org context exists and
 * row-level security is off by default, so these checks — and their tests —
 * are the guarantee; `runInOrgContext` adds the database's own when it is on.
 */
@Injectable()
export class PublicProductReviewsService {
    constructor(
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            POSTS_PER_WINDOW,
            POST_WINDOW_MS,
        ),
    ) {}

    async read(token: string): Promise<PublicReviewInvitation> {
        const inv = await this.requireOpen(token);
        return runInOrgContext(inv.organizationId, async () => {
            const order = await this.requireEligibleOrder(inv);
            const reviewed = new Set(
                (
                    await prisma.productReview.findMany({
                        where: {
                            organizationId: inv.organizationId,
                            invitationId: inv.id,
                        },
                        select: { orderItemId: true },
                    })
                ).map((r) => r.orderItemId),
            );
            const site = await prisma.site.findFirst({
                where: {
                    organizationId: inv.organizationId,
                    deletedAt: null,
                    currentPublicationId: { not: null },
                },
                orderBy: { createdAt: "asc" },
                select: { style: true },
            });
            const first = order.customer.firstName?.trim();
            const lastInitial = order.customer.lastName?.trim().charAt(0);
            return {
                storeName: order.store.name,
                theme: site
                    ? siteStyleVariables(parseSiteStyle(site.style))
                    : null,
                suggestedName: first
                    ? `${first}${lastInitial ? ` ${lastInitial.toUpperCase()}.` : ""}`
                    : "Verified buyer",
                lines: order.items.map((item) => ({
                    orderItemId: item.id,
                    productName: item.product.name,
                    image: item.product.image,
                    reviewed: reviewed.has(item.id),
                })),
            };
        });
    }

    async submit(
        token: string,
        dto: PublicReviewDto,
    ): Promise<{ orderItemId: string; completed: boolean }> {
        const inv = await this.requireOpen(token);
        if (!this.limiter.take(inv.id)) {
            throw tooManyRequests(
                "Too many reviews at once. Try again shortly.",
            );
        }
        return runInOrgContext(inv.organizationId, async () => {
            const order = await this.requireEligibleOrder(inv);
            // The line must be THIS invitation's order's — an id from another
            // order or business is simply not found here.
            const item = order.items.find((i) => i.id === dto.orderItemId);
            if (!item)
                throw new NotFoundException("That item is not on this order");

            const body = dto.body ? clean(dto.body) : "";
            const rating = dto.rating;
            try {
                return await prisma.$transaction(async (tx) => {
                    // First, the invitation itself: still open, and locked, so
                    // two posts for the last two lines cannot both miss that
                    // the order is now complete.
                    const open = await tx.reviewInvitation.updateMany({
                        where: {
                            id: inv.id,
                            organizationId: inv.organizationId,
                            completedAt: null,
                            expiresAt: { gt: new Date() },
                        },
                        data: { updatedAt: new Date() },
                    });
                    if (open.count === 0) {
                        throw gone(
                            "expired",
                            "This link no longer takes reviews.",
                        );
                    }
                    const review = await tx.productReview.create({
                        data: {
                            organizationId: inv.organizationId,
                            storeId: order.storeId,
                            invitationId: inv.id,
                            orderItemId: item.id,
                            productId: item.productId,
                            productName: item.product.name,
                            customerId: order.customerId,
                            invitedTo: inv.toAddress,
                            rating,
                            body: body || null,
                            displayName: clean(dto.displayName),
                        },
                        select: { id: true },
                    });
                    // "A review needs a reply": the low ones and the written
                    // ones. One per review — a retry is a no-op.
                    if (rating <= 3 || body) {
                        await tx.notification.create({
                            data: {
                                organizationId: inv.organizationId,
                                type: REVIEW_NOTICE_TYPE,
                                reviewId: review.id,
                                title: `A ${rating}-star review of ${item.product.name}`,
                                body: body
                                    ? body.slice(0, 140)
                                    : "No comment left.",
                            },
                        });
                    }
                    const done = await tx.productReview.count({
                        where: { invitationId: inv.id },
                    });
                    const completed = done >= order.items.length;
                    if (completed) {
                        await tx.reviewInvitation.update({
                            where: { id: inv.id },
                            data: { completedAt: new Date() },
                        });
                    }
                    return { orderItemId: item.id, completed };
                });
            } catch (err) {
                if (
                    err instanceof Prisma.PrismaClientKnownRequestError &&
                    err.code === "P2002"
                ) {
                    throw new ConflictException({
                        message: "This item has already been reviewed.",
                        details: { field: "orderItemId" },
                    });
                }
                throw err;
            }
        });
    }

    /** Found by hash; 404 if unknown, 410 with a reason if it has ended. */
    private async requireOpen(token: string) {
        const inv = await prisma.reviewInvitation.findUnique({
            where: { tokenHash: hashReviewToken(token) },
            select: {
                id: true,
                organizationId: true,
                orderId: true,
                toAddress: true,
                expiresAt: true,
                completedAt: true,
            },
        });
        if (!inv) throw new NotFoundException("Review link not found");
        if (inv.completedAt) {
            throw gone("completed", "Every item has been reviewed. Thank you.");
        }
        if (inv.expiresAt <= new Date()) {
            throw gone("expired", "This link has expired.");
        }
        return inv;
    }

    /** The invitation's own order — and it must still be reviewable (R1). */
    private async requireEligibleOrder(inv: {
        organizationId: string;
        orderId: string;
    }) {
        const order = await prisma.order.findFirst({
            where: { id: inv.orderId, organizationId: inv.organizationId },
            select: {
                organizationId: true,
                storeId: true,
                customerId: true,
                status: true,
                paymentStatus: true,
                store: { select: { name: true } },
                customer: {
                    select: { email: true, firstName: true, lastName: true },
                },
                items: {
                    select: {
                        id: true,
                        productId: true,
                        product: { select: { name: true, image: true } },
                    },
                    orderBy: { id: "asc" },
                },
            },
        });
        if (!order) throw new NotFoundException("Review link not found");
        const ineligible = orderIneligibility({
            organizationId: order.organizationId,
            status: order.status,
            paymentStatus: order.paymentStatus,
            customerEmail: order.customer.email,
        });
        if (ineligible) {
            throw gone("not-eligible", "This order no longer takes reviews.");
        }
        return order;
    }
}
