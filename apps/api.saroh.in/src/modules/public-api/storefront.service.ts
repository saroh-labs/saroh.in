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
    PageQuery,
    StorefrontBookingView,
    StorefrontOrderView,
    StorefrontPaymentView,
} from "@saroh/api-contract";
import type { StorefrontToken } from "@saroh/database";
import { prisma } from "@saroh/database";
import { randomUUID } from "node:crypto";

import { onlinePaymentBlocker } from "../bookings/booking-payment";
import type { PublicBooking } from "../bookings/public-booking-page";
import { publicBookingResult } from "../bookings/public-bookings.controller";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import type { BookInput } from "../bookings/reservation";
import { splitName } from "../bookings/reservation";
import { EnquiryService } from "../enquiry/enquiry.service";
import { hashPayToken } from "../invoices/pay-token";
import type { CheckoutStartDto } from "../orders/checkout.dto";
import { PublicCheckoutService } from "../orders/public-checkout.service";
import { publicSiteOnline } from "../organizations/organization-lifecycle.policy";
import { emitWebhook } from "../outbound-webhooks/emitter";
import type { CreateIntentResult } from "../payments/payments.service";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { PublicCatalogueService } from "../products/public-catalogue.service";
import { effectiveStorefront } from "../sites/sells-from";
import { siteOriginOf } from "../sites/site-origin";
import { SitesService } from "../sites/sites.service";
import { PublicPlansService } from "../subscriptions/public-plans.service";
import {
    bookingState,
    holdPay,
    payBy,
    paymentProvider,
    planInterval,
} from "./v1-enums";
import { invalid, pageList, toMoney } from "./v1-support";

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

/** A visitor's booking as the API names it: its hold token, not a pay token. */
function bookingView(
    booking: PublicBooking,
    state: string,
    holdExpiresAt: string | null,
    holdToken: string | null,
): StorefrontBookingView {
    return {
        id: booking.reference,
        serviceName: booking.serviceName,
        startAt: booking.startAt,
        endAt: booking.endAt,
        state: bookingState.out(state),
        holdExpiresAt,
        holdToken,
    };
}

function bookingAnswer(
    result: Awaited<ReturnType<PublicBookingsService["bookOnline"]>>,
): StorefrontBookingView {
    const made = publicBookingResult(result.booking, result.payToken);
    return bookingView(made, made.state, made.holdExpiresAt, made.payToken);
}

/** The provider's checkout data, with Saroh's own ids and words left out. */
function paymentView(intent: CreateIntentResult): StorefrontPaymentView {
    return {
        id: intent.paymentIntentId,
        provider: paymentProvider.out(intent.provider),
        amount: { amountMinor: intent.amountCents, currency: intent.currency },
        publicKey: intent.publicKey,
        clientParams: intent.clientParams,
    };
}

/** Optional text the site reads as a string; anything else is null. */
const textOr = (value: unknown): string | null =>
    typeof value === "string" ? value : null;

/** A post's published snapshot (`posts.service.ts` publish), as the API answers it. */
function postView(snapshot: unknown, origin: string | null) {
    const { post, path } = (snapshot ?? {}) as {
        post?: Record<string, unknown>;
        path?: unknown;
    };
    const p = post ?? {};
    const category = p.category as { name?: unknown; slug?: unknown } | null;
    return {
        slug: textOr(p.slug) ?? "",
        title: textOr(p.title) ?? "",
        excerpt: textOr(p.excerpt),
        image: textOr(p.image),
        category:
            category &&
            typeof category.name === "string" &&
            typeof category.slug === "string"
                ? { name: category.name, slug: category.slug }
                : null,
        author: textOr(p.author),
        publishedAt: textOr(p.publishedAt) ?? "",
        hostedUrl:
            origin && typeof path === "string" ? `${origin}${path}` : null,
        content: textOr(p.content) ?? "",
    };
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

    /** Each listing's product id: the API names products, never listings. */
    private async productIdsOf(organizationId: string, listingIds: string[]) {
        const rows = await prisma.productListing.findMany({
            where: { organizationId, id: { in: listingIds } },
            select: { id: true, productId: true },
        });
        return new Map(rows.map((r) => [r.id, r.productId]));
    }

    async products(
        organizationId: string,
        q: PageQuery,
        visitor: string | undefined,
    ) {
        const site = await this.site(organizationId);
        const list = await this.catalogue.list(site.id, visitor);
        const ids = await this.productIdsOf(
            organizationId,
            list.products.map((p) => p.listingId),
        );
        const cards = list.products.flatMap((p) => {
            const productId = ids.get(p.listingId);
            return productId ? [{ ...p, productId }] : [];
        });
        return {
            ...pageList(
                cards,
                q,
                (p) => p.productId,
                (p) => ({
                    id: p.productId,
                    slug: p.slug,
                    name: p.name,
                    price: toMoney(p.price, p.currency),
                    priceFrom: p.priceFrom,
                    image: p.image && { url: p.image.url, alt: p.image.alt },
                    soldOut: p.soldOut,
                    hostedUrl: productUrl(site.origin, p.slug),
                }),
            ),
            storefront: { name: list.storefront.name },
        };
    }

    async product(
        organizationId: string,
        slug: string,
        visitor: string | undefined,
    ) {
        const site = await this.site(organizationId);
        const p = await this.catalogue.product(site.id, slug, visitor);
        return {
            id: p.productId,
            slug: p.slug,
            name: p.name,
            description: p.description,
            price: toMoney(p.price, p.currency),
            images: p.images.map((i) => ({
                url: i.url,
                alt: i.alt,
                kind: i.kind,
            })),
            variants: p.variants.map((v) => ({
                id: v.id,
                title: v.title,
                price: v.price === null ? null : toMoney(v.price, p.currency),
                soldOut: v.stock === "SOLD_OUT",
            })),
            hostedUrl: productUrl(site.origin, p.slug),
        };
    }

    async stock(
        organizationId: string,
        q: PageQuery,
        visitor: string | undefined,
    ) {
        const site = await this.site(organizationId);
        const { items } = await this.catalogue.stock(site.id, visitor);
        const ids = await this.productIdsOf(
            organizationId,
            items.map((i) => i.listingId),
        );
        const rows = items.flatMap((i) => {
            const productId = ids.get(i.listingId);
            return productId ? [{ ...i, productId }] : [];
        });
        return pageList(
            rows,
            q,
            (i) => i.productId,
            (i) => ({
                productId: i.productId,
                variantId: i.variantId,
                left: i.left,
                soldOut: i.soldOut,
            }),
        );
    }

    async services(organizationId: string, q: PageQuery) {
        const site = await this.site(organizationId);
        const page = await this.bookings.publicBookingPage(site.id);
        return pageList(
            page.services,
            q,
            (s) => s.id,
            (s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                durationMinutes: s.durationMinutes,
                price:
                    s.priceCents === null || !s.currency
                        ? null
                        : { amountMinor: s.priceCents, currency: s.currency },
                hostedUrl: serviceUrl(site.origin, s.id),
            }),
        );
    }

    async availability(
        organizationId: string,
        serviceId: string,
        query: AvailabilityQuery,
    ) {
        await this.service(organizationId, serviceId);
        const slots = await this.bookings.publicAvailability(
            serviceId,
            query.from,
            query.to,
            query.staffId,
        );
        return pageList(
            slots,
            query,
            (slot) => new Date(slot.startAt).toISOString(),
            (slot) => ({
                startAt: new Date(slot.startAt).toISOString(),
                endAt: new Date(slot.endAt).toISOString(),
                staffIds: slot.staffIds ?? [],
                placesLeft: slot.placesLeft ?? null,
            }),
        );
    }

    async days(organizationId: string, serviceId: string, query: DaysQuery) {
        await this.service(organizationId, serviceId);
        const read = await this.bookings.publicDays(serviceId, new Date(), {
            skip: query.skip ?? 0,
            staffId: query.staffId ?? null,
        });
        return {
            timezone: read.timezone,
            kind: read.kind,
            capacity: read.capacity,
            days: read.days.map((d) => ({
                date: d.date,
                open: d.open,
                closed: d.closed,
                starts: d.starts.map((st) => ({
                    startAt: st.startAt,
                    endAt: st.endAt,
                    staffId: st.staffId,
                    placesLeft: st.placesLeft,
                })),
            })),
            staff: read.staff.map((p) => ({ id: p.id, name: p.name })),
        };
    }

    async staff(organizationId: string, serviceId: string, q: PageQuery) {
        await this.service(organizationId, serviceId);
        return pageList(
            await this.bookings.publicServiceStaff(serviceId),
            q,
            (p) => p.id,
            (p) => ({ id: p.id, name: p.name }),
        );
    }

    async posts(organizationId: string, q: PageQuery) {
        const site = await this.site(organizationId);
        const { posts } = await this.sites.getPublicPosts(site.id);
        return pageList(
            posts.map((snapshot) => postView(snapshot, site.origin)),
            q,
            (p) => p.slug,
            ({ content: _content, ...card }) => card,
        );
    }

    async post(organizationId: string, slug: string) {
        const site = await this.site(organizationId);
        const { snapshot } = await this.sites.getPublicPost(site.id, slug);
        return postView(snapshot, site.origin);
    }

    async planList(
        organizationId: string,
        q: PageQuery,
        visitor: string | undefined,
    ) {
        const site = await this.site(organizationId);
        const read = await this.plans.list(site.id, visitor);
        return {
            ...pageList(
                read.plans,
                q,
                (p) => p.id,
                (p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    price: toMoney(p.price, p.currency),
                    interval: planInterval.out(p.interval),
                    hostedUrl: site.origin
                        ? `${site.origin}/account/plan`
                        : null,
                }),
            ),
            payOnline: read.payOnline,
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
                { ...bookInput(body, email), pay: holdPay.in(body.pay) },
                visitor,
            ),
        );
    }

    async release(
        organizationId: string,
        holdToken: string,
        visitor?: string,
    ): Promise<StorefrontBookingView> {
        await this.holdOf(organizationId, holdToken);
        const hold = await this.bookings.releasePublicHold(holdToken, visitor);
        return bookingView(hold.booking, hold.state, hold.holdExpiresAt, null);
    }

    /** The business's own provider's checkout data for a hold. */
    async pay(organizationId: string, holdToken: string, visitor?: string) {
        if ((await onlinePaymentBlocker(organizationId)) !== null) {
            throw paymentsUnavailable();
        }
        await this.holdOf(organizationId, holdToken);
        return paymentView(
            await this.invoices.createIntent(holdToken, {}, visitor),
        );
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
    ): Promise<StorefrontOrderView> {
        const email = visitorEmailOf(token, body.email);
        const payment = payBy.in(body.payment);
        if (
            payment === "ONLINE" &&
            (await onlinePaymentBlocker(organizationId)) !== null
        ) {
            throw paymentsUnavailable();
        }
        const site = await this.site(organizationId);
        const { first, last } = splitName(body.name);
        const dto = {
            lines: await this.bagLines(site.id, body.lines),
            fulfilment: body.fulfilment.toUpperCase(),
            address: body.address,
            payment,
            notes: body.notes ?? null,
            discountCode: body.discountCode ?? null,
            // The checkout's own retry key; a retry of this call is
            // `Idempotency-Key`'s, through `once` in the controller.
            key: randomUUID(),
            returnPath: body.returnPath,
        } as CheckoutStartDto;
        const started = await this.checkout.startAs(
            site.id,
            organizationId,
            async () => {
                // Not on the checkout's transaction: the contact stays even if
                // the checkout fails, so its webhook goes with it.
                const known = await prisma.contact.findUnique({
                    where: { organizationId_email: { organizationId, email } },
                    select: { id: true },
                });
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
                if (!known) {
                    await emitWebhook(prisma, {
                        organizationId,
                        type: "customer.created",
                        id: contact.id,
                    });
                }
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
        return {
            id: started.orderId,
            number: started.orderNumber,
            total: toMoney(started.total, started.currency),
            payBy: payBy.out(started.payBy),
            payment: started.payment && paymentView(started.payment),
        };
    }

    /** The bag as the checkout takes it: each product's listing at the site's storefront. */
    private async bagLines(siteId: string, lines: OrderBody["lines"]) {
        const site = await prisma.site.findFirst({
            where: { id: siteId },
            select: { organizationId: true, storefrontId: true },
        });
        const store = site && (await effectiveStorefront(prisma, site));
        const listings = store
            ? await prisma.productListing.findMany({
                  where: {
                      storeId: store.id,
                      productId: { in: lines.map((l) => l.productId) },
                  },
                  select: { id: true, productId: true },
              })
            : [];
        const listingOf = new Map(listings.map((l) => [l.productId, l.id]));
        return lines.map((line, i) => {
            const listingId = listingOf.get(line.productId);
            if (!listingId) {
                throw invalid(
                    `body.lines.${i}.productId: This product isn't sold on this site.`,
                );
            }
            return {
                listingId,
                variantId: line.variantId ?? null,
                quantity: line.quantity,
            };
        });
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
        // A retry is `Idempotency-Key`'s, through `once` in the controller.
        const made = await this.enquiry.submit(
            formId,
            body.data,
            undefined,
            visitor,
        );
        return { id: made.submissionId };
    }
}

function bookInput(body: BookBody, email: string): BookInput {
    return {
        startAt: body.startAt,
        bookerName: body.name,
        bookerEmail: email,
        bookerPhone: body.phone,
        staffId: body.staffId,
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
