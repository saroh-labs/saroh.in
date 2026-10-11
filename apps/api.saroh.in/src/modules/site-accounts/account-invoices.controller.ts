import {
    ConflictException,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Injectable,
    NotFoundException,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { InvoicesService } from "../invoices/invoices.service";
import { payLinkUrlFor } from "../invoices/pay-link-url";
import { takesPaymentOnline } from "../subscriptions/member-invoices";
import { AccountAreaGuard } from "./account-area";
import { invoicesDueWhere, readInvoicesDue } from "./account-details-reads";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import { CustomerSessionGuard } from "./customer-session.guard";
import type { AccountInvoiceDue } from "./customer-view";

type Ctx = Pick<CustomerContext, "organizationId" | "contactId" | "accountId">;

/** Said when the business can't take this one online (409). */
export const PAY_DIRECT =
    "This can't be paid online right now. Ask the business how to pay.";

/**
 * "Pay now" on one of the customer's open invoices (DEC-142): a new pay
 * link, made when they press it, so they never meet an old one — the link a
 * team member makes, replacing the one before (`payLinkForCustomer`).
 *
 * The invoice is found by its id **and** the signed-in customer's contact
 * first, so another customer's — even in the same business — is a 404, and
 * so is one already paid, void, or an order's. What the mint refuses, it
 * refuses in words written for the customer's side too (409): no provider
 * to pay through, or an autopay charge under way on it (D13).
 */
@Injectable()
export class AccountInvoicesService {
    constructor(private readonly invoices: InvoicesService) {}

    list(ctx: Ctx, now: Date = new Date()): Promise<AccountInvoiceDue[]> {
        return readInvoicesDue(ctx, now);
    }

    async payLink(ctx: Ctx, invoiceRef: string): Promise<{ url: string }> {
        const token = await prisma.$transaction(async (tx) => {
            const own = await tx.invoice.findFirst({
                where: { AND: [{ id: invoiceRef }, invoicesDueWhere(ctx)] },
                select: { id: true },
            });
            if (!own) throw new NotFoundException();
            // Said in the customer's words before the mint's own refusal,
            // which is written for the team (as a plan's "Pay now", A8).
            if (!(await takesPaymentOnline(tx, ctx.organizationId))) {
                throw new ConflictException(PAY_DIRECT);
            }
            const made = await this.invoices.payLinkForCustomer(
                tx,
                ctx.organizationId,
                own.id,
            );
            return made.token;
        });
        return { url: await payLinkUrlFor(ctx.organizationId, token) };
    }
}

/**
 * The customer's open invoices in their account (DEC-142; ADR-011), at
 * `/public/site-accounts/me/invoices`, beside the receipts A5 lists.
 *
 * Guarded as the rest of the account area (`account.controller.ts`): a 404
 * until `SITE_ACCOUNT_AREA=on`, then the site's signed relay and a live
 * session for that very site. The site's server calls these; a browser
 * never does. Registered by `SubscriptionsModule`, which already holds the
 * invoices service a member's own plan pays through (A8), as it serves
 * `AccountPlanController`.
 */
@Controller("public/site-accounts/me/invoices")
@UseGuards(AccountAreaGuard, CustomerSessionGuard)
export class AccountInvoicesController {
    constructor(private readonly invoices: AccountInvoicesService) {}

    /** Open invoices, the one due soonest first. */
    @Get()
    @Header("Cache-Control", "no-store")
    list(
        @CurrentCustomer() customer: CustomerContext,
    ): Promise<AccountInvoiceDue[]> {
        return this.invoices.list(customer);
    }

    /** A fresh pay link for one of them. Another customer's is a 404. */
    @Post(":ref/pay")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    pay(
        @CurrentCustomer() customer: CustomerContext,
        @Param("ref") ref: string,
    ): Promise<{ url: string }> {
        return this.invoices.payLink(customer, ref);
    }
}
