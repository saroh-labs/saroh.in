import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    Ip,
    Post,
} from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { CheckoutReturnDto } from "./checkout-return.dto";
import { PaymentLookupService } from "./payment-lookup.service";

/**
 * Limits. Each return that passes costs a call to the business's provider,
 * so a caller is held to a few a minute, and one provider order — one
 * checkout, one buyer — to fewer.
 */
const RETURNS_PER_CALLER = 20;
const RETURNS_PER_ORDER = 6;
const WINDOW_MS = 60_000;

/**
 * PUBLIC checkout return (P1), mounted at `/public/payments/return` with NO
 * guards: the buyer's browser posts what the provider's window handed it
 * the moment it closes on a payment, so the page moves on without waiting
 * for the webhook.
 *
 * No session and no organization from the caller: the business is the one
 * whose payment intent names the provider's order, its key secret checks
 * the signature, and the payment itself — status and amount — is read
 * from the provider ({@link PaymentLookupService.confirmCheckoutReturn}). A
 * return that doesn't check out is a 400 and writes nothing.
 */
@Controller("public/payments")
export class CheckoutReturnController {
    private readonly perCaller = new FixedWindowRateLimiter(
        RETURNS_PER_CALLER,
        WINDOW_MS,
    );
    private readonly perOrder = new FixedWindowRateLimiter(
        RETURNS_PER_ORDER,
        WINDOW_MS,
    );

    constructor(private readonly lookup: PaymentLookupService) {}

    @Post("return")
    @HttpCode(200)
    async confirm(
        @Body() dto: CheckoutReturnDto,
        @Ip() ip?: string,
    ): Promise<{ confirmed: boolean }> {
        if (
            !this.perCaller.take(hashClientIp(ip) ?? "unknown") ||
            !this.perOrder.take(`${dto.provider}:${dto.providerOrderId}`)
        ) {
            throw new HttpException(
                "Too many requests for this payment. Try again shortly.",
                429,
            );
        }
        return this.lookup.confirmCheckoutReturn(dto);
    }
}
