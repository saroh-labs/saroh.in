import {
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { orderPayLinkUrlFor } from "../invoices/pay-link-url";
import { hashPayToken } from "../invoices/pay-token";
import { lineName } from "../orders/order-line";
import type { PayLinkStanding } from "../orders/order-pay-link";
import {
    dueCentsOf,
    PAY_LINK_ORDER_SELECT,
    payLinkRefusal,
    payLinkStanding,
} from "../orders/order-pay-link";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { parseSiteStyle, siteStyleVariables } from "../sites/site-style";
import { orderPayOnline } from "./order-pay-online";
import type { CreateIntentResult } from "./payments.service";
import { PaymentsService } from "./payments.service";
import { parseIntentBody } from "./public-invoices.service";

/**
 * What the customer's order pay page shows, and nothing more (plan B, B11).
 * An explicit allow-list: the business, the order's number, its lines and
 * total, what is due, how it stands, and the customer's first name. No
 * email, phone, address, notes, ids or payment references.
 */
export interface PublicOrderPayView {
    businessName: string;
    orderNumber: string;
    firstName: string | null;
    lines: {
        name: string;
        quantity: number;
        unitPrice: string;
        amount: string;
    }[];
    total: string;
    /** What paying now charges: the total less what was taken. */
    due: string;
    currency: string;
    /** DUE can be paid; PAID says so; CLOSED is cancelled or refunded. */
    status: PayLinkStanding;
    /** The business's site theme as `--site-*` variables; null for defaults. */
    theme: Record<string, string> | null;
    /**
     * Whether the page offers "Pay" (`orderPayOnline`, R33): false on a plan
     * without online payments, with Payments off, or with no provider that
     * opens the checkout window. The page then shows the order view-only,
     * with "Pay {business} directly", as the invoice page does.
     */
    payOnline: boolean;
    /**
     * Where this link lives (DEC-069, plan L6): `orderPayLinkUrlFor`'s
     * answer, the business's own address or the apex. The renderer sends
     * a pay page opened on another host here.
     */
    payUrl: string;
}

/** Reads per caller per minute: a page reload is fine, a scraper is not. */
const READS_PER_WINDOW = 30;
const READ_WINDOW_MS = 60_000;
/** Payment starts per caller per ten minutes. */
const PAYS_PER_WINDOW = 10;
const PAY_WINDOW_MS = 10 * 60_000;

const money = (cents: number) => (cents / 100).toFixed(2);

function tooManyRequests(): HttpException {
    return new HttpException(
        "Too many requests for this link. Try again shortly.",
        429,
    );
}

/** Every miss looks the same: unknown, replaced and retired links alike. */
function notFound(): never {
    throw new NotFoundException("Order not found");
}

/**
 * The customer's side of an order's pay link — no session, so everything
 * hangs on the token (plan B, B11; the invoice pay link's pattern,
 * `public-invoices.service.ts`).
 *
 * The token is found by its hash and nothing else is taken from the request
 * but an idempotency key: the business, the amount, the currency and the
 * provider all come from the stored order. An unknown, replaced or retired
 * token is a 404. The hash lookup runs before any org context exists, so
 * these checks are the guarantee; `runInOrgContext` adds the database's own
 * when row-level security is on.
 */
@Injectable()
export class PublicOrderPayService {
    constructor(
        private readonly payments: PaymentsService,
        @Optional()
        private readonly readLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        @Optional()
        private readonly payLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            PAYS_PER_WINDOW,
            PAY_WINDOW_MS,
        ),
    ) {}

    async read(
        token: string,
        callerHash?: string,
    ): Promise<PublicOrderPayView> {
        const tokenHash = hashPayToken(token);
        // Keyed on the caller: a limiter keyed on the token the caller sent
        // throttles nothing, since every new token is a fresh window.
        if (!this.readLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await this.find(tokenHash);
        return runInOrgContext(found.organizationId, async () => {
            const order = await prisma.order.findFirst({
                where: { id: found.id, organizationId: found.organizationId },
                select: {
                    ...PAY_LINK_ORDER_SELECT,
                    orderId: true,
                    organization: { select: { name: true } },
                    customer: { select: { firstName: true } },
                    // A walk-in (B13) is greeted by the name they gave.
                    walkInName: true,
                    items: {
                        orderBy: { id: "asc" },
                        select: {
                            quantity: true,
                            price: true,
                            product: { select: { name: true } },
                            // A treatment's line names its service (E9).
                            service: { select: { name: true } },
                            variant: { select: { title: true } },
                        },
                    },
                },
            });
            if (!order?.organization) notFound();
            const [site, payOnline] = await Promise.all([
                prisma.site.findFirst({
                    where: {
                        organizationId: found.organizationId,
                        deletedAt: null,
                        currentPublicationId: { not: null },
                    },
                    orderBy: { createdAt: "asc" },
                    select: { style: true },
                }),
                orderPayOnline(prisma, found.organizationId, order.storeId),
            ]);
            const status = payLinkStanding(order);
            const first = order.customer
                ? (order.customer.firstName?.trim() ?? "")
                : (order.walkInName?.trim().split(/\s+/)[0] ?? "");
            return {
                businessName: order.organization.name,
                orderNumber: order.orderId,
                firstName: first.length > 0 ? first : null,
                lines: order.items.map((i) => {
                    const unit = Math.round(Number(i.price) * 100);
                    const name = lineName(i) ?? "";
                    return {
                        name: i.variant?.title
                            ? `${name} · ${i.variant.title}`
                            : name,
                        quantity: i.quantity,
                        unitPrice: toMoneyString(i.price),
                        amount: money(unit * i.quantity),
                    };
                }),
                total: toMoneyString(order.total),
                due: money(status === "DUE" ? dueCentsOf(order) : 0),
                currency: order.currency,
                status,
                payOnline,
                theme: site
                    ? siteStyleVariables(parseSiteStyle(site.style))
                    : null,
                payUrl: await orderPayLinkUrlFor(found.organizationId, token),
            };
        });
    }

    /**
     * Start paying: an intent for what is still due on the order, through
     * the provider its storefront takes payment with. `body` is read by
     * hand: anything but an idempotency key — an amount above all — is
     * ignored rather than refused.
     */
    async createIntent(
        token: string,
        body: unknown,
        callerHash?: string,
    ): Promise<CreateIntentResult> {
        const { idempotencyKey } = parseIntentBody(body);
        const tokenHash = hashPayToken(token);
        if (!this.payLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await this.find(tokenHash);
        await assertOrganizationOpen(found.organizationId);
        return runInOrgContext(found.organizationId, async () => {
            const order = await prisma.order.findFirst({
                where: { id: found.id, organizationId: found.organizationId },
                select: PAY_LINK_ORDER_SELECT,
            });
            if (!order?.organizationId) notFound();
            // Paid at the counter meanwhile, or no longer payable: no
            // intent is made.
            const refusal = payLinkRefusal(order);
            if (refusal) throw new ConflictException(refusal);
            return this.payments.createIntentForOrderPayLink(
                {
                    id: order.id,
                    organizationId: order.organizationId,
                    storeId: order.storeId,
                    amountCents: dueCentsOf(order),
                    currency: order.currency,
                },
                { idempotencyKey },
            );
        });
    }

    private async find(
        tokenHash: string,
    ): Promise<{ id: string; organizationId: string }> {
        const row = await prisma.order.findUnique({
            where: { payTokenHash: tokenHash },
            select: { id: true, organizationId: true },
        });
        if (!row?.organizationId) notFound();
        return { id: row.id, organizationId: row.organizationId };
    }
}
