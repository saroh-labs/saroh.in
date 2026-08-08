import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";

import { CreateIntentDto } from "./dto";
import type {
    CreateIntentResult,
    PublicReceiptResult,
} from "./payments.service";
import { PaymentsService } from "./payments.service";

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
    constructor(private readonly payments: PaymentsService) {}

    /**
     * Create (or idempotently replay) a payment intent for `:orderId`. Body is
     * `{ provider?, idempotencyKey? }` — NEVER an amount. Returns the non-secret
     * handoff the client SDK needs (`publicKey`, `clientParams`, provider intent
     * id); never any secret.
     */
    @Post(":orderId/payment-intent")
    @HttpCode(201)
    createIntent(
        @Param("orderId") orderId: string,
        @Body() dto: CreateIntentDto,
    ): Promise<CreateIntentResult> {
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
    receipt(@Param("orderId") orderId: string): Promise<PublicReceiptResult> {
        return this.payments.getReceipt(orderId);
    }
}
