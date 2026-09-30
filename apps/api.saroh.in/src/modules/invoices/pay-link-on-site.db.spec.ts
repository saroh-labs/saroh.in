/**
 * Every pay link Saroh hands out is on the business's own address once
 * `PAY_LINK_ON_SITE` is on (DEC-069, plan L7), against a real Postgres: the
 * invoice email, the invoice's and a booking's "Copy link", an order's pay
 * link (made by hand and with a new order), a renewal retried by pay link,
 * and a member's "Pay now". With the flag off, or no live site, each is the
 * apex link as before.
 *
 * The flag and the site are real rows; a service whose own writes other
 * specs cover (an order's link, a retry, "Pay now") is stood in for, so this
 * spec is about where each caller puts the link. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));
// The controllers are called directly; their guards are the request's.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));

import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { BookingsController } from "../bookings/bookings.controller";
import { BookingsService } from "../bookings/bookings.service";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import { FlagKey } from "../feature-flags/flags";
import type { OrderCancelService } from "../orders/order-cancel.service";
import type { OrderFulfilmentChangeService } from "../orders/order-fulfilment-change.service";
import type { OrderKitchenService } from "../orders/order-kitchen.service";
import type { OrderPayLinkService } from "../orders/order-pay-link.service";
import type { OrderStageBatchService } from "../orders/order-stage-batch.service";
import { OrdersController } from "../orders/orders.controller";
import type { OrdersService } from "../orders/orders.service";
import { OrganizationOrdersController } from "../orders/organization-orders.controller";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { AccountPlanService } from "../site-accounts/account-plan.service";
import type { SubscriptionAutopayService } from "../subscriptions/subscription-autopay.service";
import { SubscriptionsController } from "../subscriptions/subscriptions.controller";
import type {
    CustomerScope,
    SubscriptionsService,
} from "../subscriptions/subscriptions.service";
import type { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { hashPayToken } from "./pay-token";

const tag = `${process.pid}x${Date.now() % 100000}`;

const comms = new CommunicationsService();
const invoices = new InvoicesService();
const sending = new InvoiceSendService(invoices, comms);
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const invoicesController = new InvoicesController(
    invoices,
    sending,
    {} as InvoicePdfService,
);
const bookingsController = new BookingsController(new BookingsService());

/** A business ready to send an invoice and take a booking's pay link. */
async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `l7-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: `user_l7_${name}_${tag}`,
        role: "OWNER",
    };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_L7",
        keyId: "rzp_test_L7",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_l7",
    });
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: `hello-${tag}@example.test`,
        credentials: { apiKey: "re_test_key" },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: `asha-${name.toLowerCase()}-${tag}@example.test`,
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    return { owner, contactId: contact.id };
}

/** The business's site at `subdomain`, published. */
async function liveSite(organizationId: string, subdomain: string) {
    const site = await prisma.site.create({
        data: {
            organizationId,
            name: "Site",
            slug: `l7-site-${subdomain}`,
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
}

/** The business's own `PAY_LINK_ON_SITE` override, as the admin console sets. */
async function payLinksOnSite(organizationId: string, enabled: boolean) {
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PAY_LINK_ON_SITE },
        create: { key: FlagKey.PAY_LINK_ON_SITE, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.upsert({
        where: {
            flagKey_organizationId: {
                flagKey: FlagKey.PAY_LINK_ON_SITE,
                organizationId,
            },
        },
        create: { flagKey: FlagKey.PAY_LINK_ON_SITE, organizationId, enabled },
        update: { enabled },
    });
}

async function issued(owner: OrganizationContext, contactId: string) {
    const draft = await invoices.createDraft(owner, {
        contactId,
        currency: "INR",
        lines: [{ description: "Membership", quantity: 1, unitPrice: "2400" }],
    });
    await invoices.issue(owner, draft.id);
    return draft.id;
}

/** The link in the email the provider was handed for this invoice. */
async function emailedLink(invoiceId: string): Promise<string> {
    const [message] = await prisma.message.findMany({ where: { invoiceId } });
    const jobs = await prisma.job.findMany({
        where: {
            type: "message.send",
            organizationId: message!.organizationId,
        },
    });
    const job = jobs.find(
        (j) => (j.payload as { messageId?: string }).messageId === message!.id,
    );
    const fake = new FakeCommsProvider("EMAIL");
    await new MessageSendHandler(new FakeCommsProviderFactory(fake)).handle(
        job!,
    );
    const link = /https:\/\/[a-z0-9.-]+\/pay\/[A-Za-z0-9_-]{43}/.exec(
        fake.calls[0]?.body ?? "",
    )?.[0];
    if (!link) throw new Error("no pay link in the email");
    return link;
}

async function futureBooking(organizationId: string, contactId: string) {
    const service = await prisma.service.create({
        data: {
            organizationId,
            name: "Check-up",
            durationMinutes: 30,
            priceCents: 80_000,
            currency: "INR",
            timezone: "Asia/Kolkata",
        },
    });
    const start = new Date("2099-01-05T05:30:00Z");
    return prisma.booking.create({
        data: {
            organizationId,
            serviceId: service.id,
            contactId,
            startAt: start,
            endAt: new Date(start.getTime() + 30 * 60_000),
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            bookerName: "Priya Raman",
            bookerEmail: "priya@example.test",
            snapshot: { service: { priceCents: 80_000, currency: "INR" } },
        },
    });
}

/** The two order controllers, their services stood in for. */
function orderControllers(organizationId: string) {
    const make = jest.fn().mockResolvedValue({
        token: "tok_order",
        payLinkCreatedAt: new Date(),
    });
    const create = jest.fn().mockResolvedValue({
        id: "ord_1",
        organizationId,
        payLink: { token: "tok_new_order", payLinkCreatedAt: new Date() },
    });
    return {
        byOrganization: new OrganizationOrdersController(
            {} as OrdersService,
            {} as OrderKitchenService,
            { make } as unknown as OrderPayLinkService,
            {} as OrderFulfilmentChangeService,
            {} as OrderCancelService,
            {} as OrderStageBatchService,
        ),
        byStore: new OrdersController({ create } as unknown as OrdersService),
    };
}

function subscriptionsController() {
    return new SubscriptionsController(
        {
            retryPayment: jest
                .fn()
                .mockResolvedValue({ ok: true, token: "tok_retry" }),
        } as unknown as SubscriptionsService,
        {} as SubscriptionAutopayService,
    );
}

function accountPlans() {
    return new AccountPlanService({
        payLinkForCustomer: jest
            .fn()
            .mockResolvedValue({ token: "tok_member" }),
    } as unknown as SubscriptionsService);
}

describe("pay links on the business's address (DEC-069, L7)", () => {
    it("puts every link on the business's subdomain with the flag on", async () => {
        const { owner, contactId } = await business("Rye");
        const address = `rye${tag}`;
        await liveSite(owner.organizationId, address);
        await payLinksOnSite(owner.organizationId, true);
        const origin = `https://${address}.saroh.app`;

        // The invoice email: the link the customer opens, and it works.
        const sentId = await issued(owner, contactId);
        await sending.send(owner, sentId);
        const link = await emailedLink(sentId);
        expect(link.startsWith(`${origin}/pay/`)).toBe(true);
        const sent = await prisma.invoice.findUniqueOrThrow({
            where: { id: sentId },
        });
        expect(sent.payTokenHash).toBe(
            hashPayToken(link.slice(`${origin}/pay/`.length)),
        );

        // The invoice's "Copy link".
        const copied = await invoicesController.payLink(
            owner,
            await issued(owner, contactId),
        );
        expect(copied.url).toMatch(
            new RegExp(
                `^${origin.replace(/\./g, "\\.")}/pay/[A-Za-z0-9_-]{43}$`,
            ),
        );

        // A booking's "Send a pay link".
        const booking = await futureBooking(owner.organizationId, contactId);
        const booked = await bookingsController.payLink(owner, booking.id);
        expect(booked.url.startsWith(`${origin}/pay/`)).toBe(true);

        // An order's pay link, made on Order Detail and with a new order.
        const orders = orderControllers(owner.organizationId);
        await expect(
            orders.byOrganization.payLink(owner, "ord_1"),
        ).resolves.toMatchObject({ url: `${origin}/pay/o/tok_order` });
        await expect(
            orders.byStore.create(
                { id: owner.userId } as AuthUser,
                "store_1",
                {} as never,
            ),
        ).resolves.toMatchObject({
            payLink: { url: `${origin}/pay/o/tok_new_order` },
        });

        // A renewal retried by pay link, and a member's "Pay now".
        await expect(
            subscriptionsController().retry(owner, "sub_1", {} as never),
        ).resolves.toMatchObject({ url: `${origin}/pay/tok_retry` });
        await expect(
            accountPlans().payLink(
                {
                    organizationId: owner.organizationId,
                } as unknown as CustomerScope,
                "sub_1",
            ),
        ).resolves.toEqual({ url: `${origin}/pay/tok_member` });
    });

    it("keeps every link on saroh.app with the flag off", async () => {
        const { owner, contactId } = await business("Mira");
        await liveSite(owner.organizationId, `mira${tag}`);
        await payLinksOnSite(owner.organizationId, false);

        const sentId = await issued(owner, contactId);
        await sending.send(owner, sentId);
        expect(await emailedLink(sentId)).toMatch(
            /^https:\/\/saroh\.app\/pay\//,
        );
        const booking = await futureBooking(owner.organizationId, contactId);
        expect(
            (await bookingsController.payLink(owner, booking.id)).url,
        ).toMatch(/^https:\/\/saroh\.app\/pay\//);
        await expect(
            orderControllers(owner.organizationId).byOrganization.payLink(
                owner,
                "ord_1",
            ),
        ).resolves.toMatchObject({ url: "https://saroh.app/pay/o/tok_order" });
        await expect(
            subscriptionsController().retry(owner, "sub_1", {} as never),
        ).resolves.toMatchObject({ url: "https://saroh.app/pay/tok_retry" });
    });

    it("keeps the link on saroh.app when the business has no live site", async () => {
        const { owner, contactId } = await business("Pulse");
        await payLinksOnSite(owner.organizationId, true);

        const sentId = await issued(owner, contactId);
        await sending.send(owner, sentId);
        expect(await emailedLink(sentId)).toMatch(
            /^https:\/\/saroh\.app\/pay\//,
        );
        await expect(
            accountPlans().payLink(
                {
                    organizationId: owner.organizationId,
                } as unknown as CustomerScope,
                "sub_1",
            ),
        ).resolves.toEqual({ url: "https://saroh.app/pay/tok_member" });
    });

    it("is on the verified custom domain when there is one", async () => {
        const { owner, contactId } = await business("Lotus");
        const address = `lotus${tag}`;
        await liveSite(owner.organizationId, address);
        const site = await prisma.site.findFirstOrThrow({
            where: { organizationId: owner.organizationId },
        });
        await prisma.domain.create({
            data: {
                organizationId: owner.organizationId,
                siteId: site.id,
                hostname: `shop-${tag}.example.test`,
                status: "VERIFIED",
                verifiedAt: new Date(),
                verificationToken: "v",
            },
        });
        await payLinksOnSite(owner.organizationId, true);

        const copied = await invoicesController.payLink(
            owner,
            await issued(owner, contactId),
        );
        expect(
            copied.url.startsWith(`https://shop-${tag}.example.test/pay/`),
        ).toBe(true);
    });
});
