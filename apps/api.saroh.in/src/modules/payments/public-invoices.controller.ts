import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Ip,
    Param,
    Post,
} from "@nestjs/common";
import { hashClientIp } from "../../common/client-ip";

import type { AutopayOutcome, AutopayStart } from "./autopay.service";
import type { CreateIntentResult } from "./payments.service";
import type { PublicInvoiceView } from "./public-invoices.service";
import { PublicInvoicesService } from "./public-invoices.service";

/**
 * An invoice's pay link (ADR-007, U13), mounted at `/public/invoices` with no
 * guards — this is what the customer's pay page on saroh.app reads and posts
 * to. The token alone names the invoice; the path is logged with it replaced
 * (`common/logging/redact.ts`).
 *
 * The link is a credential, so neither answer may be cached, indexed or leak
 * the URL onward in a Referer header.
 */

@Controller("public/invoices")
export class PublicInvoicesController {
    constructor(private readonly invoices: PublicInvoicesService) {}

    @Get(":token")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    read(
        @Param("token") token: string,
        @Ip() ip: string,
    ): Promise<PublicInvoiceView> {
        return this.invoices.read(token, hashClientIp(ip));
    }

    /**
     * Start paying the invoice. The body may name a provider and an
     * idempotency key; it is deliberately untyped so the global validation
     * pipe passes it through and anything else in it — an amount above all —
     * is ignored. The amount charged is always the stored invoice's total.
     */
    @Post(":token/payment-intent")
    @HttpCode(201)
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    createIntent(
        @Param("token") token: string,
        @Body() body: unknown,
        @Ip() ip: string,
    ): Promise<CreateIntentResult> {
        return this.invoices.createIntent(token, body, hashClientIp(ip));
    }

    /**
     * "Pay and turn on autopay" for a plan's invoice (D12). The body names
     * the method the customer picked from the page's offer, and an
     * idempotency key; read by hand as the intent's is, so nothing else in
     * it — an amount, a limit — is taken. 409 for an invoice that isn't a
     * plan's, or a business without autopay.
     */
    @Post(":token/autopay")
    @HttpCode(201)
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    startAutopay(
        @Param("token") token: string,
        @Body() body: unknown,
        @Ip() ip: string,
    ): Promise<AutopayStart> {
        return this.invoices.startAutopay(token, body, hashClientIp(ip));
    }

    /** How autopay stands, for the page on the business's site after (D12). */
    @Get(":token/autopay")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    autopay(
        @Param("token") token: string,
        @Ip() ip: string,
    ): Promise<AutopayOutcome & { payUrl: string }> {
        return this.invoices.autopayOutcome(token, hashClientIp(ip));
    }
}
