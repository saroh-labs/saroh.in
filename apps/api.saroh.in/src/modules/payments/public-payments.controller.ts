import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpException,
    Ip,
    Param,
    Post,
} from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";

import { CreateIntentDto } from "./dto";
import type {
    CreateIntentResult,
    PublicReceiptResult,
} from "./payments.service";
import { PaymentsService } from "./payments.service";

/**
 * Limits (PAY-08). Each intent without a key costs a call to the merchant's
 * provider and a row, so one leaked order id could otherwise open intents
 * without end. The checkout runs in the buyer's browser, so the caller's
 * address is the buyer's own. Per order as well, because one order has one
 * buyer. The receipt is polled while a payment settles, so its limit is loose.
 */
const INTENTS_PER_ORDER = 10;
const INTENTS_PER_CALLER = 30;
const RECEIPTS_PER_CALLER = 240;
const WINDOW_MS = 60_000;

function tooManyRequests(): HttpException {
    return new HttpException(
        "Too many requests for this order. Try again shortly.",
        429,
    );
}

/**
 * PUBLIC checkout API (S5-004), mounted at `/public/orders` with NO guards —
 * this is what an anonymous buyer's checkout/receipt page hits. There is
 * deliberately no `BetterAuthGuard`/`OrganizationGuard` and no `@OrgContext()`:
 * no session, no client-supplied org.
 *
 * The owning organization is derived ENTIRELY from the target Order inside
 * {@link PaymentsService} (never from this client), and the charged amount is
 * computed server-side from `order.total` — there is NO amount field anywhere on
 * this surface, so a buyer can never influence how much is charged. Mirrors the
 * guardless enquiry (S3-002) and public-bookings (S4-002) controllers.
 */
@Controller("public/orders")
export class PublicPaymentsController {
    private readonly intentsPerOrder = new FixedWindowRateLimiter(
        INTENTS_PER_ORDER,
        WINDOW_MS,
    );
    private readonly intentsPerCaller = new FixedWindowRateLimiter(
        INTENTS_PER_CALLER,
        WINDOW_MS,
    );
    private readonly receiptsPerCaller = new FixedWindowRateLimiter(
        RECEIPTS_PER_CALLER,
        WINDOW_MS,
    );

    constructor(private readonly payments: PaymentsService) {}

    /**
     * Create (or idempotently replay) a payment intent for `:orderId`. Body is
     * `{ provider?, idempotencyKey? }` — NEVER an amount. Returns the non-secret
     * handoff the client SDK needs (`publicKey`, `clientParams`, provider intent
     * id); never any secret.
     */
    @Post(":orderId/payment-intent")
    @HttpCode(201)
    async createIntent(
        @Param("orderId") orderId: string,
        @Body() dto: CreateIntentDto,
        @Ip() ip?: string,
    ): Promise<CreateIntentResult> {
        const caller = hashClientIp(ip) ?? "unknown";
        if (
            !this.intentsPerCaller.take(caller) ||
            !this.intentsPerOrder.take(orderId)
        ) {
            throw tooManyRequests();
        }
        return this.payments.createIntentForOrderPublic(orderId, {
            idempotencyKey: dto.idempotencyKey,
            provider: dto.provider,
        });
    }

    /**
     * The buyer-safe receipt for `:orderId`: order number, line totals,
     * currency, reconciled `paymentStatus`, and the latest intent's status. No
     * secrets, no internal ids.
     */
    @Get(":orderId/receipt")
    async receipt(
        @Param("orderId") orderId: string,
        @Ip() ip?: string,
    ): Promise<PublicReceiptResult> {
        if (!this.receiptsPerCaller.take(hashClientIp(ip) ?? "unknown")) {
            throw tooManyRequests();
        }
        return this.payments.getReceipt(orderId);
    }
}
