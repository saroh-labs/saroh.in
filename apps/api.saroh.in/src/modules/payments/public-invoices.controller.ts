import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    Post,
} from "@nestjs/common";

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
    read(@Param("token") token: string): Promise<PublicInvoiceView> {
        return this.invoices.read(token);
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
    ): Promise<CreateIntentResult> {
        return this.invoices.createIntent(token, body);
    }
}
