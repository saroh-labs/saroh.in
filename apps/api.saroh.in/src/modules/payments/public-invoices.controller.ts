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
import { createHash } from "node:crypto";

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
/**
 * Who is asking, as a hash — the same shape the public booking controller
 * uses. `undefined` when the platform gives no address, and the service then
 * falls back to the link itself.
 */
function callerHash(ip: string | undefined): string | undefined {
    return ip ? createHash("sha256").update(ip).digest("hex") : undefined;
}

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
        return this.invoices.read(token, callerHash(ip));
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
        return this.invoices.createIntent(token, body, callerHash(ip));
    }
}
