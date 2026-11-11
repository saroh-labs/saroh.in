import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type {
    AvailabilityQuery,
    BookBody,
    DaysQuery,
    FormSubmitBody,
    HoldBody,
    OrderBody,
} from "@saroh/api-contract";
import type { StorefrontToken } from "@saroh/database";
import { prisma } from "@saroh/database";

import { onlinePaymentBlocker } from "../bookings/booking-payment";
import { publicBookingResult } from "../bookings/public-bookings.controller";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import type { BookInput } from "../bookings/reservation";
import { splitName } from "../bookings/reservation";
import { EnquiryService } from "../enquiry/enquiry.service";
import { hashPayToken } from "../invoices/pay-token";
import type { CheckoutStartDto } from "../orders/checkout.dto";
import { PublicCheckoutService } from "../orders/public-checkout.service";
import { publicSiteOnline } from "../organizations/organization-lifecycle.policy";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { PublicCatalogueService } from "../products/public-catalogue.service";
import { siteOriginOf } from "../sites/site-origin";
import { SitesService } from "../sites/sites.service";
import { PublicPlansService } from "../subscriptions/public-plans.service";

const notFound = (message: string) =>
    new NotFoundException({ error: { code: "not_found", message } });

/** 409 `payments_unavailable`: the business takes no online payment now. */
export function paymentsUnavailable(): ConflictException {
    return new ConflictException({
        error: {
            code: "payments_unavailable",
            message:
                "This business can't take payment online right now. Book or order to pay in person.",
        },
    });
}

/**
 * The email a token's order or booking is made under: the one its server
 * minted it with. A body email must be that one (any case) or left out, so
 * a visitor can't book or order as someone else (review of U7).
 */
export function visitorEmailOf(
    token: Pick<StorefrontToken, "visitorEmail">,
    given: string | undefined,
): string {
    if (!token.visitorEmail) {
        throw new ForbiddenException({
            error: {
                code: "visitor_email_required",
                message:
                    "This token has no visitor email. Mint it with visitor.email to book or order with it.",
            },
        });
    }
    if (given && given.trim().toLowerCase() !== token.visitorEmail) {
        throw new ForbiddenException({
            error: {
                code: "visitor_email_mismatch",
                message:
                    "This email isn't the one the token was minted for. Leave email out, or send that one.",
            },
        });
    }
    return token.visitorEmail;
}

/** A visitor's booking, renamed for the API: its hold token, not a pay token. */
function bookingAnswer(
    result: Awaited<ReturnType<PublicBookingsService["bookOnline"]>>,
) {
    const { payToken, ...rest } = publicBookingResult(
        result.booking,
        result.payToken,
    );
    return { ...rest, holdToken: payToken };
}

/**
 * The storefront API (plan 2026-11-10-001, U7) over the same services the
 * business's own Saroh site reads through `/public/*`. The business is the
 * key's or token's; its site is its first published one, the one its
 * links lead to (`siteOriginOf`). Every id a caller sends is checked
 * against that business before a service sees it.
 */
@Injectable()
export class StorefrontService {
    constructor(
        private readonly catalogue: PublicCatalogueService,
        private readonly bookings: PublicBookingsService,
        private readonly plans: PublicPlansService,
        private readonly sites: SitesService,
        private readonly enquiry: EnquiryService,
        private readonly invoices: PublicInvoicesService,
        private readonly checkout: PublicCheckoutService,
    ) {}

    /** The business's published, online site and where it lives. */
    private async site(
        organizationId: string,
    ): Promise<{ id: string; origin: string | null }> {
        const site = await prisma.site.findFirst({
            where: {
                organizationId,
                deletedAt: null,
                currentPublicationId: { not: null },
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                organization: { select: { lifecycleStatus: true } },
            },
        });
        if (!site || !publicSiteOnline(site.organization.lifecycleStatus)) {
            throw notFound("This business has no published site.");
        }
        return {
            id: site.id,
            origin: await siteOriginOf(organizationId, { siteId: site.id }),
        };
    }

    private async service(organizationId: string, serviceId: string) {
        const found = await prisma.service.findFirst({
            where: { id: serviceId, organizationId, deletedAt: null },
            select: { id: true },
        });
        if (!found) throw notFound("Service not found.");
    }

    // — Reads ——————————————————————————————————————————————————————

    async products(organizationId: string, visitor: string | undefined) {
        const site = await this.site(organizationId);
        const list = await this.catalogue.list(site.id, visitor);
        return {
            ...list,
            products: list.products.map((p) => ({
                ...p,
                hostedUrl: productUrl(site.origin, p.slug),
            })),
        };
    }

    async product(
        organizationId: string,
        slug: string,
        visitor: string | undefined,
    ) {
        const site = await this.site(organizationId);
        const product = await this.catalogue.product(site.id, slug, visitor);
        return { ...product, hostedUrl: productUrl(site.origin, product.slug) };
    }

    async stock(organizationId: string, visitor: string | undefined) {
        const site = await this.site(organizationId);
        return this.catalogue.stock(site.id, visitor);
    }

    async services(organizationId: string) {
        const site = await this.site(organizationId);
        const page = await this.bookings.publicBookingPage(site.id);
        return {
            data: page.services.map((s) => ({
                ...s,
                hostedUrl: serviceUrl(site.origin, s.id),
            })),
        };
    }

    async availability(
        organizationId: string,
        serviceId: string,
        query: AvailabilityQuery,
    ) {
        await this.service(organizationId, serviceId);
        return {
            data: await this.bookings.publicAvailability(
                serviceId,
                query.from,
                query.to,
                query.staffId,
            ),
        };
    }

    async days(organizationId: string, serviceId: string, query: DaysQuery) {
        await this.service(organizationId, serviceId);
        return this.bookings.publicDays(serviceId, new Date(), {
            skip: query.skip ?? 0,
            staffId: query.staffId ?? null,
        });
    }

    async staff(organizationId: string, serviceId: string) {
        await this.service(organizationId, serviceId);
        return { data: await this.bookings.publicServiceStaff(serviceId) };
    }

    async posts(organizationId: string) {
        const site = await this.site(organizationId);
        return this.sites.getPublicPosts(site.id);
    }

    async post(organizationId: string, slug: string) {
        const site = await this.site(organizationId);
        return this.sites.getPublicPost(site.id, slug);
    }

    async planList(organizationId: string, visitor: string | undefined) {
        const site = await this.site(organizationId);
        const read = await this.plans.list(site.id, visitor);
        return {
            ...read,
            plans: read.plans.map((p) => ({
                ...p,
                hostedUrl: site.origin ? `${site.origin}/account/plan` : null,
            })),
        };
    }

    // — Writes, with a storefront token ————————————————————————————

    /** Book to pay at the desk, or a service with nothing to pay. */
    async book(
        organizationId: string,
        token: StorefrontToken,
        body: BookBody,
        visitor?: string,
    ) {
        const email = visitorEmailOf(token, body.email);
        await this.service(organizationId, body.serviceId);
        return bookingAnswer(
            await this.bookings.bookOnline(
                body.serviceId,
                { ...bookInput(body, email), pay: "DESK" },
                visitor,
            ),
        );
    }

    /** Hold the slot while the customer pays online; 409 without a provider. */
    async hold(
        organizationId: string,
        token: StorefrontToken,
        body: HoldBody,
        visitor?: string,
    ) {
        const email = visitorEmailOf(token, body.email);
        await this.service(organizationId, body.serviceId);
        if ((await onlinePaymentBlocker(organizationId)) !== null) {
            throw paymentsUnavailable();
        }
        return bookingAnswer(
            await this.bookings.bookOnline(
                body.serviceId,
                { ...bookInput(body, email), pay: body.pay },
                visitor,
            ),
        );
    }

    async release(organizationId: string, holdToken: string, visitor?: string) {
        await this.holdOf(organizationId, holdToken);
        return this.bookings.releasePublicHold(holdToken, visitor);
    }

    /** The business's own provider's checkout data for a hold. */
    async pay(organizationId: string, holdToken: string, visitor?: string) {
        if ((await onlinePaymentBlocker(organizationId)) !== null) {
            throw paymentsUnavailable();
        }
        await this.holdOf(organizationId, holdToken);
        return this.invoices.createIntent(holdToken, {}, visitor);
    }

    /** A hold token of this business, or 404: another's is as good as missing. */
    private async holdOf(organizationId: string, holdToken: string) {
        const invoice = await prisma.invoice.findUnique({
            where: { payTokenHash: hashPayToken(holdToken) },
            select: { organizationId: true, source: true },
        });
        if (
            invoice?.organizationId !== organizationId ||
            invoice.source !== "BOOKING"
        ) {
            throw notFound("Hold not found.");
        }
    }

    /**
     * An order for the guest the business's server vouched for by minting
     * the token with their email: their contact by email, made if new and
     * otherwise left as it is. No site account is made, and the order
     * replaces or counts against only the same token's orders
     * (`createCheckoutOrder`).
     */
    async order(
        organizationId: string,
        token: StorefrontToken,
        body: OrderBody,
        clientHash: string,
    ) {
        const email = visitorEmailOf(token, body.email);
        if (
            body.payment === "ONLINE" &&
            (await onlinePaymentBlocker(organizationId)) !== null
        ) {
            throw paymentsUnavailable();
        }
        const site = await this.site(organizationId);
        const { first, last } = splitName(body.name);
        const dto = {
            lines: body.lines,
            fulfilment: body.fulfilment,
            address: body.address,
            payment: body.payment,
            notes: body.notes ?? null,
            discountCode: body.discountCode ?? null,
            key: body.idempotencyKey,
            returnPath: body.returnPath,
        } as CheckoutStartDto;
        return this.checkout.startAs(
            site.id,
            organizationId,
            async () => {
                const contact = await prisma.contact.upsert({
                    where: { organizationId_email: { organizationId, email } },
                    update: {},
                    create: {
                        organizationId,
                        email,
                        firstName: first ?? null,
                        lastName: last ?? null,
                        phone: body.phone ?? null,
                        source: "storefront-api",
                    },
                    select: { id: true, firstName: true, lastName: true },
                });
                return {
                    accountId: null,
                    email,
                    contactId: contact.id,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    storefrontTokenId: token.id,
                };
            },
            clientHash,
            dto,
        );
    }

    async submitForm(
        organizationId: string,
        formId: string,
        body: FormSubmitBody,
        visitor?: string,
    ) {
        const form = await prisma.form.findFirst({
            where: { id: formId, organizationId },
            select: { id: true },
        });
        if (!form) throw notFound("Form not found.");
        return this.enquiry.submit(
            formId,
            body.data,
            body.idempotencyKey,
            visitor,
        );
    }
}

function bookInput(body: BookBody, email: string): BookInput {
    return {
        startAt: body.startAt,
        bookerName: body.name,
        bookerEmail: email,
        bookerPhone: body.phone,
        staffId: body.staffId,
        idempotencyKey: body.idempotencyKey,
    };
}

/** The product's page in the business's shop. */
export function productUrl(origin: string | null, slug: string): string | null {
    return origin ? `${origin}/shop/${encodeURIComponent(slug)}` : null;
}

/** The booking page, opened on the service (`/book?service=<id>`). */
export function serviceUrl(origin: string | null, id: string): string | null {
    return origin ? `${origin}/book?service=${encodeURIComponent(id)}` : null;
}
