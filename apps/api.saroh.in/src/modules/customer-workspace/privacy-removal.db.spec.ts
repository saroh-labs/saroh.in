/**
 * Removing a customer's details for a privacy request against a real
 * Postgres (DEC-042, C11): everywhere their details live, what stays for the
 * law, the refusals, their autopay at the provider first (D20), their site
 * account (ADR-011) and message thread (A13), and a hard delete that asks
 * about autopay first too. Runs in the integration project
 * (TEST_DATABASE_URL). Only the app env is stubbed (the credential key).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
    declaredNodeEnv: "test",
}));

import { randomBytes } from "node:crypto";

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { isReservedContactEmail } from "../contacts/contact-email";
import { ContactsService } from "../contacts/contacts.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { MandatesService } from "../payments/mandates.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { destinationHashFor } from "../site-accounts/sign-in-codes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomersListService } from "./customers-list.service";
import { PrivacyRemovalService } from "./privacy-removal.service";
import { resolveContact } from "./resolve-contact";

const fake = new FakeMerchantProvider();
const payments = new PaymentsService(new FakeProviderFactory(fake));
const mandates = new MandatesService(new FakeProviderFactory(fake));
const removals = new PrivacyRemovalService(mandates, payments);
const contacts = new ContactsService(mandates);
const list = new CustomersListService();
const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;
const details = new CustomerDetailService(availability);

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

let ownerId = "";

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({ data: { email: `c11-owner-${tag}@x.com` } })
    ).id;
});

beforeEach(() => {
    fake.mandateCancelCalls.length = 0;
});

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `c11-${next()}` },
    });
    return { organizationId: org.id, userId: ownerId, role: "OWNER" };
}

async function person(
    ctx: OrganizationContext,
    over: { email?: string; firstName?: string; phone?: string } = {},
): Promise<string> {
    return (
        await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: over.email ?? `asha-${next()}@example.in`,
                firstName: over.firstName ?? "Asha",
                lastName: "Rao",
                phone: over.phone ?? "+91 98450 00001",
                company: "Rao Studio",
                addressLine1: "12 MG Road",
                city: "Bengaluru",
                state: "Karnataka",
                postalCode: "560001",
                country: "IN",
            },
        })
    ).id;
}

async function store(ctx: OrganizationContext): Promise<string> {
    return (
        await prisma.store.create({
            data: {
                name: "Northwind",
                slug: `c11-store-${next()}`,
                organizationId: ctx.organizationId,
            },
        })
    ).id;
}

async function storeCustomer(
    ctx: OrganizationContext,
    storeId: string,
    contactIds: string[],
    email = `shop-${next()}@example.in`,
): Promise<string> {
    const customer = await prisma.customer.create({
        data: {
            storeId,
            organizationId: ctx.organizationId,
            email,
            firstName: "Asha",
            lastName: "Rao",
            phone: "+91 98450 00001",
            city: "Bengaluru",
            state: "Karnataka",
            zipCode: "560001",
        },
    });
    for (const contactId of contactIds) {
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: ctx.organizationId,
                contactId,
                customerId: customer.id,
                linkedByUserId: ownerId,
            },
        });
    }
    return customer.id;
}

async function order(
    ctx: OrganizationContext,
    storeId: string,
    customerId: string,
    status: "DELIVERED" | "PROCESSING" = "DELIVERED",
): Promise<string> {
    return (
        await prisma.order.create({
            data: {
                storeId,
                organizationId: ctx.organizationId,
                orderId: `ORD-${next()}`,
                customerId,
                subtotal: "450",
                total: "450",
                currency: "INR",
                status,
                paymentStatus: "PAID",
                deliveryName: "Asha Rao",
                deliveryPhone: "+91 98450 00001",
                deliveryLine1: "12 MG Road",
                deliveryCity: "Bengaluru",
                deliveryState: "Karnataka",
                deliveryPostalCode: "560001",
                notes: "Ring twice, Asha is upstairs",
            },
        })
    ).id;
}

async function service(ctx: OrganizationContext): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Haircut",
                durationMinutes: 45,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        })
    ).id;
}

async function booking(
    ctx: OrganizationContext,
    serviceId: string,
    contactId: string,
    start: Date,
): Promise<string> {
    return (
        await prisma.booking.create({
            data: {
                organizationId: ctx.organizationId,
                serviceId,
                contactId,
                startAt: start,
                endAt: new Date(start.getTime() + 45 * 60_000),
                timezone: "Asia/Kolkata",
                status: "CONFIRMED",
                bookerName: "Asha Rao",
                bookerEmail: "asha@example.in",
                bookerPhone: "+91 98450 00001",
                intakeNote: "Allergic to latex",
                snapshot: {
                    service: { name: "Haircut", priceCents: 50_000 },
                    booker: {
                        name: "Asha Rao",
                        email: "asha@example.in",
                        phone: "+91 98450 00001",
                    },
                },
            },
        })
    ).id;
}

async function plan(ctx: OrganizationContext, name = "Monthly") {
    return (
        await prisma.subscriptionPlan.create({
            data: {
                organizationId: ctx.organizationId,
                name,
                price: "1600",
                currency: "INR",
                interval: "MONTH",
            },
        })
    ).id;
}

async function subscribe(
    ctx: OrganizationContext,
    planId: string,
    contactId: string,
    status: "ACTIVE" | "CANCELLED" = "ACTIVE",
) {
    const now = new Date();
    return (
        await prisma.customerSubscription.create({
            data: {
                organizationId: ctx.organizationId,
                planId,
                contactId,
                status,
                price: "1600",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: now,
                currentPeriodStart: now,
                currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
            },
        })
    ).id;
}

/** Connect the business's Razorpay (the fake), for autopay. */
async function connect(ctx: OrganizationContext) {
    await payments.connectProvider(ctx, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_c11",
    });
}

/** An ACTIVE mandate on a subscription that has already ended. */
async function mandateOnEndedPlan(ctx: OrganizationContext, contactId: string) {
    const subscriptionId = await subscribe(
        ctx,
        await plan(ctx),
        contactId,
        "CANCELLED",
    );
    return prisma.paymentMandate.create({
        data: {
            organizationId: ctx.organizationId,
            contactId,
            subscriptionId,
            provider: "RAZORPAY",
            providerCustomerId: `cust_${next()}`,
            providerMandateId: `token_${next()}`,
            displayHint: "asha@okbank",
            status: "ACTIVE",
            activatedAt: new Date(),
        },
    });
}

async function site(ctx: OrganizationContext): Promise<string> {
    return (
        await prisma.site.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Northwind",
                slug: `c11-site-${next()}`,
            },
        })
    ).id;
}

function contactOf(id: string) {
    return prisma.contact.findUniqueOrThrow({ where: { id } });
}

function remover(ctx: OrganizationContext, actions: string[]) {
    return {
        ...ctx,
        role: "MEMBER" as const,
        roleKey: "front-desk",
        actions: resolveCapabilities("front-desk", actions as never[]),
    };
}

describe("removing a customer's details (DEC-042)", () => {
    it("anonymises them, cancels what's to come, and keeps the order and invoice as they were", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const storeId = await store(ctx);
        const customerId = await storeCustomer(ctx, storeId, [asha]);
        const orderId = await order(ctx, storeId, customerId);
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: asha,
                status: "ISSUED",
                currency: "INR",
                subtotal: "450",
                total: "450",
                billToName: "Asha Rao",
                billToEmail: "asha@example.in",
                billToState: "Karnataka",
                billToAddress: "12 MG Road, Bengaluru",
            },
        });
        const serviceId = await service(ctx);
        const future = await booking(
            ctx,
            serviceId,
            asha,
            new Date(Date.now() + 3 * 86_400_000),
        );
        const past = await booking(
            ctx,
            serviceId,
            asha,
            new Date(Date.now() - 3 * 86_400_000),
        );
        await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: asha,
                body: "Likes oat milk",
            },
        });
        await prisma.contactAttention.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: asha,
                kind: "MEDICAL",
                label: "Diabetic",
                sensitive: true,
            },
        });
        await prisma.consent.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: asha,
                channel: "EMAIL",
                status: "GRANTED",
            },
        });

        const preview = await removals.preview(ctx, asha);
        expect(preview.refusals).toEqual([]);
        expect(preview.name).toBe("Asha Rao");
        expect(preview.goes).toMatchObject({
            notes: 1,
            attention: 1,
            consents: 1,
            storeRecords: 1,
            ordersScrubbed: 1,
            bookingsCancelled: 1,
            bookings: 2,
            account: false,
            autopay: 0,
        });
        expect(preview.stays).toMatchObject({ orders: 1, invoices: 1 });

        const result = await removals.remove(ctx, asha);
        expect(result.goes).toMatchObject({
            notes: 1,
            attention: 1,
            consents: 1,
            storeRecords: 1,
            ordersScrubbed: 1,
            bookingsCancelled: 1,
            bookings: 2,
        });

        // The contact: anonymised in place.
        const after = await contactOf(asha);
        expect(after).toMatchObject({
            email: `removed+${asha}@removed.invalid`,
            firstName: null,
            lastName: null,
            phone: null,
            company: null,
            addressLine1: null,
            city: null,
            state: null,
            postalCode: null,
            country: null,
        });
        expect(after.removedAt).toBeInstanceOf(Date);

        // The order keeps its amounts, status and place of supply.
        const kept = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
        });
        expect(kept).toMatchObject({
            status: "DELIVERED",
            paymentStatus: "PAID",
            deliveryState: "Karnataka",
            deliveryName: null,
            deliveryPhone: null,
            deliveryLine1: null,
            deliveryCity: null,
            deliveryPostalCode: null,
            notes: null,
        });
        expect(kept.total.toString()).toBe("450");

        // The invoice prints as before.
        const paper = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoice.id },
        });
        expect(paper).toMatchObject({
            contactId: asha,
            billToName: "Asha Rao",
            billToEmail: "asha@example.in",
            billToAddress: "12 MG Road, Bengaluru",
        });

        // The booking to come is cancelled; both keep their time and
        // service under "Removed customer".
        const [was, gone] = await Promise.all(
            [past, future].map((id) =>
                prisma.booking.findUniqueOrThrow({ where: { id } }),
            ),
        );
        expect(gone.status).toBe("CANCELLED");
        expect(was.status).toBe("CONFIRMED");
        for (const b of [was, gone]) {
            expect(b).toMatchObject({
                bookerName: "Removed customer",
                bookerEmail: null,
                bookerPhone: null,
                intakeNote: null,
            });
            expect(b.snapshot).toEqual({
                service: { name: "Haircut", priceCents: 50_000 },
                booker: { name: "Removed customer", email: null, phone: null },
            });
        }

        // What hung off them is gone.
        expect(
            await prisma.contactNote.count({ where: { contactId: asha } }),
        ).toBe(0);
        expect(
            await prisma.contactAttention.count({ where: { contactId: asha } }),
        ).toBe(0);
        expect(await prisma.consent.count({ where: { contactId: asha } })).toBe(
            0,
        );

        // Activity names ids and counts, never a value.
        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                action: "customer.removed",
            },
        });
        expect(audit.targetId).toBe(asha);
        const said = JSON.stringify(audit.metadata);
        expect(said).not.toContain("Asha");
        expect(said).not.toContain("@example.in");
        expect(said).not.toContain("98450");
    });

    it("anonymises their store customer and drops the link, so their old email starts afresh", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const storeId = await store(ctx);
        const oldEmail = `asha-shop-${next()}@example.in`;
        const customerId = await storeCustomer(ctx, storeId, [asha], oldEmail);
        await order(ctx, storeId, customerId);

        await removals.remove(ctx, asha);

        const shop = await prisma.customer.findUniqueOrThrow({
            where: { id: customerId },
        });
        expect(shop).toMatchObject({
            email: `removed+${customerId}@removed.invalid`,
            firstName: null,
            lastName: null,
            phone: null,
            city: null,
            state: null,
            zipCode: null,
        });
        expect(isReservedContactEmail(shop.email)).toBe(true);
        expect(
            await prisma.customerIdentityLink.count({
                where: { contactId: asha },
            }),
        ).toBe(0);
        // Nothing in the business holds their old email any more: a later
        // order with it makes a new store customer and contact.
        expect(
            await prisma.customer.count({
                where: { storeId, email: oldEmail },
            }),
        ).toBe(0);
        expect(
            await prisma.contact.count({
                where: {
                    organizationId: ctx.organizationId,
                    email: { contains: "asha-shop" },
                },
            }),
        ).toBe(0);
    });

    it("keeps a store customer another contact is linked to; only this link goes", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const ravi = await person(ctx, { firstName: "Ravi" });
        const storeId = await store(ctx);
        const shared = await storeCustomer(ctx, storeId, [asha, ravi]);

        const preview = await removals.preview(ctx, asha);
        expect(preview.goes.storeRecords).toBe(0);
        await removals.remove(ctx, asha);

        const shop = await prisma.customer.findUniqueOrThrow({
            where: { id: shared },
        });
        expect(shop.firstName).toBe("Asha");
        expect(isReservedContactEmail(shop.email)).toBe(false);
        const links = await prisma.customerIdentityLink.findMany({
            where: { customerId: shared },
            select: { contactId: true },
        });
        expect(links).toEqual([{ contactId: ravi }]);
    });

    it("replaces what was sent to them, keeping its delivery status", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const message = await prisma.message.create({
            data: {
                organizationId: ctx.organizationId,
                channel: "EMAIL",
                contactId: asha,
                toAddress: "asha@example.in",
                subject: "Your order",
                body: "Hi Asha, your order is ready",
                status: "SENT",
            },
        });
        await prisma.delivery.create({
            data: {
                organizationId: ctx.organizationId,
                messageId: message.id,
                provider: "resend",
                status: "BOUNCED",
                error: "550 asha@example.in: mailbox full",
            },
        });

        await removals.remove(ctx, asha);

        const sent = await prisma.message.findUniqueOrThrow({
            where: { id: message.id },
            include: { deliveries: true },
        });
        expect(sent.body).toBe("Removed");
        expect(sent.toAddress).toBe(`removed+${asha}@removed.invalid`);
        expect(sent.status).toBe("SENT");
        expect(sent.deliveries[0]).toMatchObject({
            status: "BOUNCED",
            error: null,
        });
    });

    it("hides the reviews they wrote and clears their name and words", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const storeId = await store(ctx);
        const customerId = await storeCustomer(ctx, storeId, [asha]);
        const orderId = await order(ctx, storeId, customerId);
        const invitation = await prisma.reviewInvitation.create({
            data: {
                organizationId: ctx.organizationId,
                orderId,
                tokenHash: randomBytes(16).toString("hex"),
                toAddress: "asha@example.in",
                expiresAt: new Date(Date.now() + 86_400_000),
            },
        });
        const review = await prisma.productReview.create({
            data: {
                organizationId: ctx.organizationId,
                storeId,
                invitationId: invitation.id,
                customerId,
                productName: "Sourdough",
                invitedTo: "asha@example.in",
                rating: 5,
                body: "Asha here — best bread in Indiranagar",
                displayName: "Asha R.",
            },
        });

        await removals.remove(ctx, asha);

        expect(
            await prisma.productReview.findUniqueOrThrow({
                where: { id: review.id },
            }),
        ).toMatchObject({
            status: "HIDDEN",
            displayName: "A customer",
            body: null,
            invitedTo: `removed+${asha}@removed.invalid`,
            // The stars still count.
            rating: 5,
        });
        expect(
            (
                await prisma.reviewInvitation.findUniqueOrThrow({
                    where: { id: invitation.id },
                })
            ).toAddress,
        ).toBe(`removed+${asha}@removed.invalid`);
    });

    it("leaves their leads and form entries as they are (DEC-041)", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const pipeline = await prisma.pipeline.create({
            data: { organizationId: ctx.organizationId, name: "Sales" },
        });
        const stage = await prisma.stage.create({
            data: {
                organizationId: ctx.organizationId,
                pipelineId: pipeline.id,
                name: "New",
                order: 0,
            },
        });
        const lead = await prisma.lead.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: asha,
                pipelineId: pipeline.id,
                stageId: stage.id,
                title: "Asha — wedding cake",
            },
        });
        const form = await prisma.form.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Enquiry",
                fields: [],
            },
        });
        const entry = await prisma.submission.create({
            data: {
                organizationId: ctx.organizationId,
                formId: form.id,
                contactId: asha,
                data: { name: "Asha" },
            },
        });

        const preview = await removals.preview(ctx, asha);
        expect(preview.stays).toMatchObject({ leads: 1, submissions: 1 });
        await removals.remove(ctx, asha);

        expect(
            await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }),
        ).toMatchObject({ contactId: asha, title: "Asha — wedding cake" });
        expect(
            await prisma.submission.findUniqueOrThrow({
                where: { id: entry.id },
            }),
        ).toMatchObject({ contactId: asha, data: { name: "Asha" } });
    });

    it("deletes their message thread with every message in it (A13)", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const thread = await prisma.customerThread.create({
            data: { organizationId: ctx.organizationId, contactId: asha },
        });
        await prisma.customerThreadMessage.create({
            data: {
                organizationId: ctx.organizationId,
                threadId: thread.id,
                author: "CUSTOMER",
                body: "Can I move my booking? — Asha",
            },
        });

        const preview = await removals.preview(ctx, asha);
        expect(preview.goes.threadMessages).toBe(1);
        await removals.remove(ctx, asha);

        expect(
            await prisma.customerThread.count({ where: { contactId: asha } }),
        ).toBe(0);
        expect(
            await prisma.customerThreadMessage.count({
                where: { threadId: thread.id },
            }),
        ).toBe(0);
    });

    it("deletes their site account with its sessions and codes; the email can sign up afresh", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const siteId = await site(ctx);
        const accountEmail = `asha-${next()}@gmail.com`;
        const account = await prisma.customerAccount.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: asha,
                email: accountEmail,
                emailVerifiedAt: new Date(),
            },
        });
        await prisma.customerSession.create({
            data: {
                organizationId: ctx.organizationId,
                accountId: account.id,
                siteId,
                tokenHash: randomBytes(32).toString("hex"),
                expiresAt: new Date(Date.now() + 86_400_000),
            },
        });
        await prisma.customerSignInCode.create({
            data: {
                organizationId: ctx.organizationId,
                destinationHash: destinationHashFor(
                    ctx.organizationId,
                    accountEmail,
                ),
                codeHash: randomBytes(16).toString("hex"),
                expiresAt: new Date(Date.now() + 600_000),
            },
        });

        expect((await removals.preview(ctx, asha)).goes.account).toBe(true);
        await removals.remove(ctx, asha);

        expect(
            await prisma.customerAccount.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.customerSession.count({
                where: { accountId: account.id },
            }),
        ).toBe(0);
        expect(
            await prisma.customerSignInCode.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        // Signing in with it again makes a new account and contact.
        const fresh = await person(ctx, { email: accountEmail });
        await expect(
            prisma.customerAccount.create({
                data: {
                    organizationId: ctx.organizationId,
                    contactId: fresh,
                    email: accountEmail,
                    emailVerifiedAt: new Date(),
                },
            }),
        ).resolves.toMatchObject({ contactId: fresh });
    });
});

describe("the refusals (default 25)", () => {
    it("refuses with an open order, and changes nothing", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const storeId = await store(ctx);
        const customerId = await storeCustomer(ctx, storeId, [asha]);
        await order(ctx, storeId, customerId, "PROCESSING");

        const preview = await removals.preview(ctx, asha);
        expect(preview.refusals).toEqual([
            {
                reason: "open-order",
                message: "Finish or cancel their open order first",
            },
        ]);
        await expect(removals.remove(ctx, asha)).rejects.toMatchObject({
            response: {
                message: "Finish or cancel their open order first",
                details: { reason: "open-order" },
            },
        });
        expect((await contactOf(asha)).firstName).toBe("Asha");
    });

    it("refuses with a live subscription, naming it", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        await subscribe(ctx, await plan(ctx, "Monthly bread"), asha);

        await expect(removals.remove(ctx, asha)).rejects.toMatchObject({
            response: {
                message: "Cancel their Monthly bread subscription first",
            },
        });
        expect((await contactOf(asha)).removedAt).toBeNull();
    });

    it("404s another business's contact, a tombstone and someone already removed", async () => {
        const ctx = await business();
        const elsewhere = await business();
        const theirs = await person(elsewhere);
        await expect(removals.remove(ctx, theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );

        const survivor = await person(ctx);
        const tombstone = await person(ctx);
        await prisma.contact.update({
            where: { id: tombstone },
            data: {
                mergedIntoId: survivor,
                email: `merged+${tombstone}@removed.invalid`,
            },
        });
        await expect(removals.preview(ctx, tombstone)).rejects.toBeInstanceOf(
            NotFoundException,
        );

        const asha = await person(ctx);
        await removals.remove(ctx, asha);
        await expect(removals.remove(ctx, asha)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("needs customer:remove, not contact:write", async () => {
        const ctx = await business();
        const asha = await person(ctx);
        const editor = remover(ctx, ["contact:read", "contact:write"]);
        await expect(removals.preview(editor, asha)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(removals.remove(editor, asha)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        const allowed = remover(ctx, ["contact:read", "customer:remove"]);
        await expect(removals.remove(allowed, asha)).resolves.toMatchObject({
            contactId: asha,
        });
    });
});

describe("their autopay (D20) ends at the provider first", () => {
    it("cancels a mandate on an ended plan at the provider, then removes them", async () => {
        const ctx = await business();
        await connect(ctx);
        const asha = await person(ctx);
        const mandate = await mandateOnEndedPlan(ctx, asha);

        expect((await removals.preview(ctx, asha)).goes.autopay).toBe(1);
        const result = await removals.remove(ctx, asha);
        expect(result.goes.autopay).toBe(1);

        expect(fake.mandateCancelCalls).toHaveLength(1);
        const after = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: mandate.id },
        });
        expect(after).toMatchObject({
            status: "CANCELLED",
            cancelReason: "PRIVACY_REMOVAL",
            displayHint: null,
            // Kept, so a late webhook still reconciles.
            providerMandateId: mandate.providerMandateId,
        });
        expect(after.cancelConfirmedAt).toBeInstanceOf(Date);
        expect((await contactOf(asha)).removedAt).toBeInstanceOf(Date);
    });

    it("refuses when the provider's answer is unsure, and removes nothing; a retry goes through", async () => {
        const ctx = await business();
        await connect(ctx);
        const asha = await person(ctx);
        const mandate = await mandateOnEndedPlan(ctx, asha);
        fake.failNextMandateCancel("UNKNOWN");

        await expect(removals.remove(ctx, asha)).rejects.toMatchObject({
            response: {
                message:
                    "Their autopay couldn't be cancelled at Razorpay yet, so nothing was removed. Try again in a few minutes",
                details: { reason: "autopay" },
            },
        });
        const still = await contactOf(asha);
        expect(still).toMatchObject({ firstName: "Asha", removedAt: null });
        expect(
            (
                await prisma.paymentMandate.findUniqueOrThrow({
                    where: { id: mandate.id },
                })
            ).displayHint,
        ).toBe("asha@okbank");

        // Asked again, the provider confirms, and the removal goes ahead.
        await expect(removals.remove(ctx, asha)).resolves.toMatchObject({
            contactId: asha,
        });
    });

    it("a hard delete cancels their autopay first, and refuses while the provider is unsure", async () => {
        const ctx = await business();
        await connect(ctx);
        const asha = await person(ctx);
        await mandateOnEndedPlan(ctx, asha);
        fake.failNextMandateCancel("UNKNOWN");

        await expect(contacts.remove(ctx, asha)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(await prisma.contact.count({ where: { id: asha } })).toBe(1);

        await contacts.remove(ctx, asha);
        expect(await prisma.contact.count({ where: { id: asha } })).toBe(0);
        // Asked twice: once unsure, once confirmed, before the rows went.
        expect(fake.mandateCancelCalls).toHaveLength(2);
    });
});

describe("after a removal", () => {
    it("the list, search and Customer Detail no longer find them, and late writers refuse", async () => {
        const ctx = await business();
        const asha = await person(ctx, {
            email: `findme-${next()}@example.in`,
            firstName: "Findme",
            phone: "+91 90000 12345",
        });
        const storeId = await store(ctx);
        const customerId = await storeCustomer(ctx, storeId, [asha]);
        await order(ctx, storeId, customerId);

        const before = await list.list(ctx, { q: "Findme" });
        expect(before.rows.map((r) => r.contactId)).toEqual([asha]);

        await removals.remove(ctx, asha);

        for (const q of ["Findme", "findme-", "90000 12345"]) {
            expect((await list.list(ctx, { q })).rows).toEqual([]);
            expect(await contacts.search(ctx, q)).toEqual([]);
        }
        expect((await contacts.list(ctx)).map((c) => c.id)).not.toContain(asha);
        await expect(details.read(ctx, asha)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        // The CRM's contact page still opens for their leads, anonymised.
        await expect(contacts.get(ctx, asha)).resolves.toMatchObject({
            firstName: null,
            phone: null,
            email: `removed+${asha}@removed.invalid`,
        });
        // Nothing can put details back.
        await expect(
            contacts.update(ctx, asha, { firstName: "Asha" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        const resolved = await resolveContact(prisma, asha, ctx.organizationId);
        expect(resolved).toMatchObject({ id: asha, removed: true });
    });
});
